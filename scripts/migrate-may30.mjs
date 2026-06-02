/**
 * migrate-may30.mjs
 * 
 * Imports cleaned JSON data (from clean-dcm-may30.mjs) into Supabase.
 * 
 * Usage:
 *   node scripts/migrate-may30.mjs --dry-run          # Preview only
 *   node scripts/migrate-may30.mjs --target local      # Import to local Supabase
 *   node scripts/migrate-may30.mjs --target remote     # Import to remote Supabase
 */

import pg from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'migration-data');

// ─── Helpers ────────────────────────────────────────────────

function deterministicUUID(seed) {
  const hash = crypto.createHash('md5').update(seed).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16), // version 4
    '8' + hash.slice(17, 20), // variant
    hash.slice(20, 32),
  ].join('-');
}

function addDaysUTC(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function isSundayPHPUTC(date) {
  const phpTime = new Date(date.getTime() + (8 * 60 * 60 * 1000));
  return phpTime.getUTCDay() === 0;
}

function skipSundayUTC(date) {
  if (isSundayPHPUTC(date)) {
    return addDaysUTC(date, 1);
  }
  return date;
}

function firstPaymentDateUTC(releaseDate) {
  const next = addDaysUTC(releaseDate, 1);
  return skipSundayUTC(next);
}

function addFrequencySkipSundayUTC(date, frequency) {
  let next;
  switch (frequency) {
    case 'daily':
      next = addDaysUTC(date, 1);
      if (isSundayPHPUTC(next)) next = addDaysUTC(next, 1);
      return next;
    default:
      next = addDaysUTC(date, 1);
      if (isSundayPHPUTC(next)) next = addDaysUTC(next, 1);
      return next;
  }
}

function computeMaturityDateAndSchedules(releaseDateStr, termDays, dailyInstallment) {
  if (!releaseDateStr) return { maturityDate: null, schedules: [] };
  
  const releaseDate = new Date(releaseDateStr + 'T00:00:00Z');
  const fpDate = firstPaymentDateUTC(releaseDate);
  
  const schedules = [];
  let currentDate = new Date(fpDate.getTime());
  
  for (let i = 1; i <= termDays; i++) {
    schedules.push({
      number: i,
      dueDate: currentDate.toISOString().slice(0, 10),
      scheduledAmount: dailyInstallment,
    });
    currentDate = addFrequencySkipSundayUTC(currentDate, 'daily');
  }
  
  const maturityDate = schedules.length > 0 ? schedules[schedules.length - 1].dueDate : releaseDateStr;
  
  return {
    firstPaymentDate: fpDate.toISOString().slice(0, 10),
    maturityDate,
    schedules,
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const targetIdx = args.indexOf('--target');
  const target = targetIdx >= 0 ? args[targetIdx + 1] : 'local';
  return { dryRun, target };
}

function getDbConfig(target) {
  if (target === 'local') {
    return {
      host: process.env.SUPABASE_DB_HOST || '127.0.0.1',
      port: Number(process.env.SUPABASE_DB_PORT || '55322'),
      database: process.env.SUPABASE_DB_NAME || 'postgres',
      user: process.env.SUPABASE_DB_USER || 'postgres',
      password: process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD || 'postgres',
    };
  } else {
    // Remote: requires REMOTE_DB_HOST, REMOTE_DB_PASSWORD etc.
    const host = process.env.REMOTE_DB_HOST;
    const password = process.env.REMOTE_DB_PASSWORD;
    if (!host || !password) {
      console.error('❌ For remote target, set REMOTE_DB_HOST and REMOTE_DB_PASSWORD in .env');
      console.error('   Get these from Supabase Dashboard → Settings → Database');
      process.exit(1);
    }
    return {
      host,
      port: Number(process.env.REMOTE_DB_PORT || '5432'),
      database: process.env.REMOTE_DB_NAME || 'postgres',
      user: process.env.REMOTE_DB_USER || 'postgres',
      password,
      ssl: { rejectUnauthorized: false },
    };
  }
}

// ─── Load Data ──────────────────────────────────────────────

function loadJSON(filename) {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.error(`❌ Missing ${filepath}. Run clean-dcm-may30.mjs first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

// ─── Main ───────────────────────────────────────────────────

async function migrate() {
  const { dryRun, target } = parseArgs();

  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   MIGRATE DCM MAY 30 DATA                 ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log(`║  Target:  ${target.padEnd(32)}║`);
  console.log(`║  Mode:    ${(dryRun ? 'DRY RUN (no writes)' : '⚠️  LIVE IMPORT').padEnd(32)}║`);
  console.log('╚═══════════════════════════════════════════╝');

  // Load cleaned data
  console.log('\n📂 Loading migration data...');
  const borrowers = loadJSON('borrowers.json');
  const loans = loadJSON('loans.json');
  const payments = loadJSON('payments.json');
  const summary = loadJSON('summary.json');

  console.log(`  Borrowers: ${borrowers.length}`);
  console.log(`  Loans:     ${loans.length}`);
  console.log(`  Payments:  ${payments.length}`);

  // Validate
  console.log('\n🔍 Validating data...');
  const totalPrincipal = loans.reduce((s, l) => s + (l.loan_amount || 0), 0);
  console.log(`  Total principal: ₱${totalPrincipal.toLocaleString()}`);
  console.log(`  Expected:        ₱${summary.total_principal?.toLocaleString() || 'N/A'}`);

  if (dryRun) {
    console.log('\n⏸️  DRY RUN — showing what would be imported:');
    printImportSummary(borrowers, loans, payments);
    console.log('\n✅ Dry run complete. Run without --dry-run to import.');
    return;
  }

  // Connect to database
  const client = new pg.Client(getDbConfig(target));
  await client.connect();
  console.log(`\n✅ Connected to ${target} database`);

  try {
    // Step 1: Lookup existing collectors
    console.log('\n📋 Step 1: Looking up collectors...');
    const { rows: existingCollectors } = await client.query(
      'SELECT id, full_name FROM public.app_collectors'
    );
    const collectorMap = {};
    for (const c of existingCollectors) {
      collectorMap[c.full_name.toLowerCase()] = c.id;
    }

    // Create any missing collectors
    const neededCollectors = [...new Set(borrowers.map(b => b.collector).filter(Boolean))];
    for (const name of neededCollectors) {
      if (!collectorMap[name.toLowerCase()]) {
        const id = deterministicUUID(`collector-${name}`);
        await client.query(
          `INSERT INTO public.app_collectors (id, full_name, is_active, created_at, updated_at)
           VALUES ($1, $2, true, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [id, name]
        );
        collectorMap[name.toLowerCase()] = id;
        console.log(`  ➕ Created collector: ${name}`);
      } else {
        console.log(`  ✅ Found collector: ${name} → ${collectorMap[name.toLowerCase()]}`);
      }
    }

    // Step 2: Insert borrowers
    console.log(`\n📋 Step 2: Inserting ${borrowers.length} borrowers...`);
    const borrowerIdMap = {}; // ref_id → uuid

    const CHUNK_SIZE = 100;
    for (let i = 0; i < borrowers.length; i += CHUNK_SIZE) {
      const chunk = borrowers.slice(i, i + CHUNK_SIZE);
      const values = [];
      const params = [];
      let paramIdx = 1;

      for (const b of chunk) {
        const uuid = deterministicUUID(`borrower-may30-${b.ref_id}`);
        borrowerIdMap[b.ref_id] = uuid;
        const collectorId = collectorMap[(b.collector || '').toLowerCase()] || null;

        values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, NOW(), NOW())`);
        params.push(
          uuid,
          b.full_name,
          b.first_name || null,
          b.last_name || null,
          b.address || null,
          b.phone || null,
          b.business || null,
          b.co_maker_name || null,
          collectorId,
          'Daily' // group
        );
      }

      await client.query(
        `INSERT INTO public.app_borrowers
         (id, full_name, first_name, last_name, address, phone, business, co_maker_name, collector_id, "group", created_at, updated_at)
         VALUES ${values.join(', ')}
         ON CONFLICT (id) DO NOTHING`,
        params
      );
      process.stdout.write(`  Inserted ${Math.min(i + CHUNK_SIZE, borrowers.length)}/${borrowers.length}\r`);
    }
    console.log(`  ✅ Inserted ${borrowers.length} borrowers                  `);

    // Step 3: Insert loans
    console.log(`\n📋 Step 3: Inserting ${loans.length} loans...`);
    const loanIdMap = {}; // ref_id → uuid
    let loanNum = 0;

    // First pass: generate all UUIDs
    for (const l of loans) {
      const uuid = deterministicUUID(`loan-may30-${l.ref_id}`);
      loanIdMap[l.ref_id] = uuid;
    }

    for (let i = 0; i < loans.length; i += CHUNK_SIZE) {
      const chunk = loans.slice(i, i + CHUNK_SIZE);
      const values = [];
      const params = [];
      let paramIdx = 1;

      for (const l of chunk) {
        loanNum++;
        const uuid = loanIdMap[l.ref_id];
        const borrowerId = borrowerIdMap[l.borrower_ref];
        const collectorId = collectorMap[(l.collector || '').toLowerCase()] || null;
        const previousLoanId = l.previous_loan_ref ? loanIdMap[l.previous_loan_ref] || null : null;
        const loanNumber = `LN-2025-MAY30-${String(loanNum).padStart(4, '0')}`;
        const interestRate = l.loan_amount > 0 ? ((l.interest || 0) / l.loan_amount) * 100 : 0;
        const status = l.status === 'paid' ? 'paid' : (l.loan_amount === 0 ? 'paid' : 'active');

        values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, NOW(), NOW())`);
        params.push(
          uuid,
          borrowerId,
          loanNumber,
          l.loan_amount || 0,         // principal_amount
          interestRate,                // interest_rate
          'flat',                      // interest_type
          l.days || 40,                // term
          'days',                      // term_unit
          'daily',                     // frequency
          l.total_loan || 0,           // total_amount
          l.daily_installment || 0,    // installment_amount
          l.insurance || 0,            // insurance_amount
          (l.interest || 0) + (l.insurance || 0), // deducted_amount
          l.release_date || null,      // release_date
          l.end_date || null,          // maturity_date
          collectorId,                 // collector_id
          status,                      // status
          l.batch || null,             // batch
          l.cycle || null,             // cycle
          previousLoanId,              // previous_loan_id
        );
      }

      await client.query(
        `INSERT INTO public.app_loans
         (id, borrower_id, loan_number, principal_amount, interest_rate, interest_type, term, term_unit, frequency, total_amount, installment_amount, insurance_amount, deducted_amount, release_date, maturity_date, collector_id, status, batch, cycle, previous_loan_id, created_at, updated_at)
         VALUES ${values.join(', ')}
         ON CONFLICT (id) DO NOTHING`,
        params
      );
      process.stdout.write(`  Inserted ${Math.min(i + CHUNK_SIZE, loans.length)}/${loans.length}\r`);
    }
    console.log(`  ✅ Inserted ${loans.length} loans                          `);

    // Step 4: Insert payments
    console.log(`\n📋 Step 4: Inserting ${payments.length} payments...`);

    for (let i = 0; i < payments.length; i += CHUNK_SIZE) {
      const chunk = payments.slice(i, i + CHUNK_SIZE);
      const values = [];
      const params = [];
      let paramIdx = 1;

      for (const p of chunk) {
        const uuid = deterministicUUID(`payment-may30-${p.loan_ref}-${p.payment_date}-${p.amount}`);
        const loanId = loanIdMap[p.loan_ref];
        const collectorId = collectorMap[(p.collector || '').toLowerCase()] || null;

        if (!loanId) {
          console.warn(`  ⚠️  Skipping payment with unknown loan_ref: ${p.loan_ref}`);
          continue;
        }

        values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, NOW(), NOW())`);
        params.push(
          uuid,
          loanId,
          p.amount || 0,
          p.payment_date || null,
          collectorId,
        );
      }

      if (values.length > 0) {
        await client.query(
          `INSERT INTO public.app_payments
           (id, loan_id, amount, payment_date, collector_id, created_at, updated_at)
           VALUES ${values.join(', ')}
           ON CONFLICT (id) DO NOTHING`,
          params
        );
      }
      process.stdout.write(`  Inserted ${Math.min(i + CHUNK_SIZE, payments.length)}/${payments.length}\r`);
    }
    console.log(`  ✅ Inserted ${payments.length} payments                      `);

    // Step 5: Generate payment schedules for active loans
    console.log('\n📋 Step 5: Generating payment schedules for active loans...');
    const activeLoans = loans.filter(l => l.status === 'active' && l.loan_amount > 0);
    let scheduleCount = 0;

    for (let i = 0; i < activeLoans.length; i += 10) {
      const chunk = activeLoans.slice(i, i + 10);

      for (const l of chunk) {
        const loanId = loanIdMap[l.ref_id];
        const term = l.days || 40;
        const dailyAmount = l.daily_installment || 0;
        const releaseDate = l.release_date;

        if (!releaseDate || !dailyAmount) continue;

        const calc = computeMaturityDateAndSchedules(releaseDate, term, dailyAmount);
        const scheduleValues = [];
        const scheduleParams = [];
        let pIdx = 1;

        for (const s of calc.schedules) {
          const schedId = deterministicUUID(`schedule-may30-${l.ref_id}-day${s.number}`);
          scheduleValues.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, NOW(), NOW())`);
          scheduleParams.push(
            schedId,
            loanId,
            s.scheduledAmount,
            s.dueDate,
            'pending'
          );
          scheduleCount++;
        }

        if (scheduleValues.length > 0) {
          await client.query(
            `INSERT INTO public.app_payment_schedules
             (id, loan_id, scheduled_amount, due_date, status, created_at, updated_at)
             VALUES ${scheduleValues.join(', ')}
             ON CONFLICT (id) DO NOTHING`,
            scheduleParams
          );
        }
      }
      process.stdout.write(`  Processed ${Math.min(i + 10, activeLoans.length)}/${activeLoans.length} active loans\r`);
    }
    console.log(`  ✅ Generated ${scheduleCount} payment schedules               `);

    // Step 6: Reload PostgREST cache
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('\n✅ PostgREST schema cache reloaded');

    // Summary
    console.log('\n═══════════════════════════════════════════');
    console.log('✅ Migration complete!');
    console.log('─────────────────────────────────────────');
    console.log(`  Borrowers:         ${borrowers.length}`);
    console.log(`  Loans:             ${loans.length}`);
    console.log(`  Payments:          ${payments.length}`);
    console.log(`  Payment Schedules: ${scheduleCount}`);
    console.log(`  Active Loans:      ${activeLoans.length}`);
    console.log(`  Paid Loans:        ${loans.length - activeLoans.length}`);
    console.log('═══════════════════════════════════════════');

  } finally {
    await client.end();
  }
}

function printImportSummary(borrowers, loans, payments) {
  const collectors = [...new Set(borrowers.map(b => b.collector).filter(Boolean))];
  const batches = [...new Set(loans.map(l => l.batch).filter(Boolean))].sort((a, b) => a - b);
  const activeLoans = loans.filter(l => l.status === 'active' && l.loan_amount > 0);
  const paidLoans = loans.filter(l => l.status === 'paid');

  console.log('\n  📊 Import Summary:');
  console.log(`  ─────────────────────────────────────`);
  console.log(`  Borrowers:    ${borrowers.length}`);
  console.log(`  Loans:        ${loans.length} (${activeLoans.length} active, ${paidLoans.length} paid)`);
  console.log(`  Payments:     ${payments.length}`);
  console.log(`  Collectors:   ${collectors.join(', ')}`);
  console.log(`  Batches:      ${batches.join(', ')}`);

  console.log('\n  📊 By Collector:');
  for (const col of collectors) {
    const colLoans = loans.filter(l => l.collector === col);
    const total = colLoans.reduce((s, l) => s + (l.loan_amount || 0), 0);
    console.log(`    ${col.padEnd(25)} ${String(colLoans.length).padStart(4)} loans  ₱${total.toLocaleString()}`);
  }
}

migrate().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
