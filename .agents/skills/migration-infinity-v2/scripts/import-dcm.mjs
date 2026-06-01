#!/usr/bin/env node
/**
 * DCM Migration Import Script
 * 
 * Imports data from DCM_Migration_Exports CSVs into the local Supabase DB.
 * 
 * Flow:
 *   1. Parse CSVs
 *   2. Normalize collector names → map to app_collectors
 *   3. Import staging_clients → app_borrowers
 *   4. Import staging_loans → app_loans
 *   5. Import staging_payments → app_payments
 *   6. Print summary
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const { Client } = pg;

// ─── CSV Parser (handles quoted fields with commas) ───
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] || '').trim();
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

// ─── Deterministic UUID from stage ID (reproducible) ───
function stageIdToUUID(stageId) {
  const hash = crypto.createHash('md5').update(stageId).digest('hex');
  // Format as UUID: 8-4-4-4-12
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');
}

// ─── Collector name normalization ───
const COLLECTOR_NAME_MAP = {
  'cresencio junco': 'Cresencio Junco',
  'cesencio junco': 'Cresencio Junco',
  'jason cayanong': 'Jason Cayanong',
  'jayson cayanong': 'Jason Cayanong',
  'gerald gera': 'Gerald Gera',
  'gera gerald': 'Gerald Gera',
  'bernie casera': 'Bernie Casera',
};

function normalizeCollectorName(raw) {
  if (!raw || !raw.trim()) return null;
  const key = raw.trim().toLowerCase();
  return COLLECTOR_NAME_MAP[key] || raw.trim();
}

// ─── Helpers ───
function parseDate(val) {
  if (!val || val === 'N/A' || val.startsWith('#')) return null;
  // Already ISO date like 2025-09-18
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val + 'T00:00:00+08:00';
  return null;
}

function parseNum(val) {
  if (!val || val === 'N/A' || val.startsWith('#')) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function parseInt2(val) {
  if (!val || val === 'N/A' || val.startsWith('#')) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : Math.round(n);
}

// ─── Main ───
async function main() {
  const baseDir = path.join(process.cwd(), 'DCM_Migration_Exports');

  console.log('═══════════════════════════════════════════════════');
  console.log('  DCM Migration Import');
  console.log('═══════════════════════════════════════════════════\n');

  // 1. Parse CSVs
  console.log('📂 Parsing CSVs...');
  const clients = parseCSV(path.join(baseDir, 'staging_clients.csv'));
  const loans = parseCSV(path.join(baseDir, 'staging_loans.csv'));
  const payments = parseCSV(path.join(baseDir, 'staging_payments.csv'));
  console.log(`   Clients:  ${clients.length}`);
  console.log(`   Loans:    ${loans.length}`);
  console.log(`   Payments: ${payments.length}\n`);

  // 2. Connect to DB
  const client = new Client({
    host: '127.0.0.1',
    port: 55322,
    database: 'postgres',
    user: 'postgres',
    password: 'postgres',
  });
  await client.connect();
  console.log('🔌 Connected to database\n');

  // 3. Get existing collectors and create missing ones
  console.log('👥 Resolving collectors...');
  const { rows: existingCollectors } = await client.query('SELECT id, full_name FROM app_collectors');
  const collectorMap = {}; // normalized name → id

  for (const c of existingCollectors) {
    collectorMap[c.full_name] = c.id;
  }

  // Gather all unique normalized collector names from loans
  const uniqueCollectors = new Set();
  for (const loan of loans) {
    const name = normalizeCollectorName(loan.collector);
    if (name) uniqueCollectors.add(name);
  }
  for (const cl of clients) {
    const name = normalizeCollectorName(cl.first_collector);
    if (name) uniqueCollectors.add(name);
  }

  // Create missing collectors
  for (const name of uniqueCollectors) {
    if (!collectorMap[name]) {
      const id = stageIdToUUID('collector-' + name);
      await client.query(
        `INSERT INTO app_collectors (id, full_name, is_active) VALUES ($1, $2, true) ON CONFLICT (id) DO NOTHING`,
        [id, name]
      );
      collectorMap[name] = id;
      console.log(`   ✅ Created collector: ${name} → ${id}`);
    } else {
      console.log(`   ✓ Existing collector: ${name} → ${collectorMap[name]}`);
    }
  }
  console.log(`   Total collectors mapped: ${Object.keys(collectorMap).length}\n`);

  // 4. Import Clients → app_borrowers
  console.log('📥 Importing borrowers...');
  const clientIdMap = {}; // client_stage_id → UUID
  let borrowerOk = 0, borrowerSkip = 0;

  for (const c of clients) {
    const nameStr = (c.client_name || '').trim().toLowerCase();
    if (['grand total', 'monthly', 'weekly', 'total'].includes(nameStr)) {
      borrowerSkip++;
      continue;
    }

    const uuid = stageIdToUUID(c.client_stage_id);
    clientIdMap[c.client_stage_id] = uuid;

    const collectorName = normalizeCollectorName(c.first_collector);
    const collectorId = collectorName ? (collectorMap[collectorName] || null) : null;

    try {
      await client.query(
        `INSERT INTO app_borrowers (id, full_name, phone, address, business, co_maker_name, collector_id, is_active, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          uuid,
          c.client_name || 'Unknown',
          c.cell_number_norm || null,
          c.address || null,
          c.business || null,
          c.co_maker_name || null,
          collectorId,
          `Migrated from ${c.client_stage_id}. Loans: ${c.loan_count || '?'}, Total: ₱${c.total_loan_amount || '?'}, Balance: ₱${c.total_balance || '?'}`,
        ]
      );
      borrowerOk++;
    } catch (err) {
      console.error(`   ❌ Borrower ${c.client_stage_id} (${c.client_name}): ${err.message}`);
      borrowerSkip++;
    }
  }
  console.log(`   ✅ Imported: ${borrowerOk}, Skipped: ${borrowerSkip}\n`);

  // 5. Import Loans → app_loans
  // Strategy: group loans by borrower, sort by cycle desc, only the LATEST
  // cycle with balance > 0 is "active"; everything else is "completed".
  // This avoids the unique_active_loan_per_borrower constraint.
  console.log('📥 Importing loans...');
  const loanIdMap = {}; // loan_stage_id → UUID
  let loanOk = 0, loanSkip = 0;

  // Pre-populate loanIdMap for all loans (needed for payment FK lookup)
  for (const l of loans) {
    loanIdMap[l.loan_stage_id] = stageIdToUUID(l.loan_stage_id);
  }

  // Group loans by borrower to decide which one is active
  const loansByBorrower = {}; // client_stage_id → [loan rows]
  for (const l of loans) {
    const key = l.client_stage_id;
    if (!loansByBorrower[key]) loansByBorrower[key] = [];
    loansByBorrower[key].push(l);
  }

  // For each borrower, sort loans by date_release desc, then pick the active one
  const activeLoanIds = new Set(); // loan_stage_ids that should be 'active'
  for (const [clientStageId, borrowerLoans] of Object.entries(loansByBorrower)) {
    // Sort by release date descending (newest first), fallback to cycle
    borrowerLoans.sort((a, b) => {
      const dateA = parseDate(a.date_release) ? new Date(parseDate(a.date_release)).getTime() : 0;
      const dateB = parseDate(b.date_release) ? new Date(parseDate(b.date_release)).getTime() : 0;
      if (dateA !== dateB) {
        return dateB - dateA;
      }
      return (parseInt2(b.cycle) || 0) - (parseInt2(a.cycle) || 0);
    });

    let foundActive = false;
    for (const l of borrowerLoans) {
      const totalBalance = parseNum(l.total_loan_balance);
      if (!foundActive && totalBalance !== null && totalBalance > 0) {
        activeLoanIds.add(l.loan_stage_id);
        foundActive = true;
      }
    }
  }

  console.log(`   Active loans identified: ${activeLoanIds.size}`);

  // Now insert all loans with correct status
  for (const l of loans) {
    const uuid = loanIdMap[l.loan_stage_id];

    const borrowerId = clientIdMap[l.client_stage_id];
    if (!borrowerId) {
      console.error(`   ⚠️  Loan ${l.loan_stage_id}: unknown client ${l.client_stage_id}, skipping`);
      loanSkip++;
      continue;
    }

    const collectorName = normalizeCollectorName(l.collector);
    const collectorId = collectorName ? (collectorMap[collectorName] || null) : null;

    const principalAmount = parseNum(l.loan_amount);
    const totalAmount = parseNum(l.total_loan);
    const totalBalance = parseNum(l.total_loan_balance);
    const interestAmount = parseNum(l.interest);
    const installmentAmount = parseNum(l.daily);
    const netLoan = parseNum(l.net_loan);
    const term = parseInt2(l.days);
    const batch = parseInt2(l.batch);
    const cycle = parseInt2(l.cycle);
    const releaseDate = parseDate(l.date_release);
    const endDate = parseDate(l.end_date);

    // Only one loan per borrower can be active
    const status = activeLoanIds.has(l.loan_stage_id) ? 'active' : 'completed';

    // Compute deducted amount (principal - net loan released)
    const deductedAmount = (principalAmount && netLoan && principalAmount > netLoan)
      ? principalAmount - netLoan
      : 0;

    const isReloan = cycle !== null && cycle > 1;

    try {
      await client.query(
        `INSERT INTO app_loans (
          id, borrower_id, loan_number, principal_amount, interest_amount,
          total_amount, installment_amount, term, term_unit, frequency,
          release_date, maturity_date, status, is_reloan,
          collector_id, deducted_amount, batch, cycle, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (id) DO NOTHING`,
        [
          uuid,
          borrowerId,
          l.loan_stage_id,                    // loan_number = original stage ID for reference
          principalAmount,
          interestAmount,
          totalAmount,
          installmentAmount,
          term,
          'days',
          'daily',
          releaseDate,
          endDate,
          status,
          isReloan,
          collectorId,
          deductedAmount,
          batch,
          cycle,
          `Source: ${l.source_sheet} row ${l.source_row}. Net loan: ₱${netLoan || '?'}. Balance: ₱${totalBalance || '?'}`,
        ]
      );
      loanOk++;
    } catch (err) {
      console.error(`   ❌ Loan ${l.loan_stage_id}: ${err.message}`);
      loanSkip++;
    }
  }
  console.log(`   ✅ Imported: ${loanOk}, Skipped: ${loanSkip}\n`);

  // 6. Import Payments → app_payments
  console.log('📥 Importing payments (this may take a moment)...');
  let paymentOk = 0, paymentSkip = 0;

  // Batch insert payments in chunks of 200
  const CHUNK_SIZE = 200;
  const paymentRows = [];

  // Build a loan_stage_id → client_stage_id lookup for fast payment processing
  const loanToClientMap = new Map();
  for (const l of loans) {
    loanToClientMap.set(l.loan_stage_id, l.client_stage_id);
  }

  for (const p of payments) {
    const loanUUID = loanIdMap[p.loan_stage_id];
    if (!loanUUID) {
      paymentSkip++;
      continue;
    }

    const amount = parseNum(p.amount);
    if (!amount || amount <= 0) {
      paymentSkip++;
      continue;
    }

    const paymentDate = parseDate(p.payment_date);
    if (!paymentDate) {
      paymentSkip++;
      continue;
    }

    const collectorName = normalizeCollectorName(p.collector);
    const collectorId = collectorName ? (collectorMap[collectorName] || null) : null;

    const clientStageId = loanToClientMap.get(p.loan_stage_id);
    const borrowerId = clientStageId ? clientIdMap[clientStageId] : null;

    paymentRows.push({
      id: stageIdToUUID(p.payment_stage_id),
      loan_id: loanUUID,
      borrower_id: borrowerId,
      collector_id: collectorId,
      amount: amount,
      payment_date: paymentDate,
      notes: `Migrated: ${p.payment_stage_id}`,
    });
  }

  // Build a loan_stage_id → loan row lookup for faster payment processing
  // (already done inline above)

  // Batch insert
  for (let i = 0; i < paymentRows.length; i += CHUNK_SIZE) {
    const chunk = paymentRows.slice(i, i + CHUNK_SIZE);

    const values = [];
    const params = [];
    let paramIdx = 1;

    for (const row of chunk) {
      values.push(`($${paramIdx},$${paramIdx+1},$${paramIdx+2},$${paramIdx+3},$${paramIdx+4},$${paramIdx+5},$${paramIdx+6})`);
      params.push(row.id, row.loan_id, row.borrower_id, row.collector_id, row.amount, row.payment_date, row.notes);
      paramIdx += 7;
    }

    try {
      await client.query(
        `INSERT INTO app_payments (id, loan_id, borrower_id, collector_id, amount, payment_date, notes)
         VALUES ${values.join(',')}
         ON CONFLICT (id) DO NOTHING`,
        params
      );
      paymentOk += chunk.length;
    } catch (err) {
      console.error(`   ❌ Payment batch at index ${i}: ${err.message}`);
      paymentSkip += chunk.length;
    }

    // Progress indicator
    if ((i / CHUNK_SIZE) % 10 === 0) {
      process.stdout.write(`   Progress: ${Math.min(i + CHUNK_SIZE, paymentRows.length)}/${paymentRows.length}\r`);
    }
  }
  console.log(`\n   ✅ Imported: ${paymentOk}, Skipped: ${paymentSkip}\n`);

  // 7. Final counts
  console.log('📊 Final database counts:');
  for (const table of ['app_collectors', 'app_borrowers', 'app_loans', 'app_payments']) {
    const res = await client.query(`SELECT COUNT(*) FROM ${table}`);
    console.log(`   ${table}: ${res.rows[0].count} records`);
  }

  // 8. Loan status summary
  const statusRes = await client.query(`SELECT status, COUNT(*) as cnt FROM app_loans GROUP BY status ORDER BY cnt DESC`);
  console.log('\n📈 Loan status breakdown:');
  for (const r of statusRes.rows) {
    console.log(`   ${r.status}: ${r.cnt}`);
  }

  // 9. Notify PostgREST to reload schema
  await client.query("NOTIFY pgrst, 'reload schema'");
  console.log('\n✅ PostgREST schema cache reloaded');

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Migration Complete!');
  console.log('═══════════════════════════════════════════════════\n');

  await client.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
