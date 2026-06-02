/**
 * full-reset-migrate.mjs
 *
 * ONE-COMMAND pipeline:
 *   1. Clear all business data from the target DB
 *   2. Re-extract & clean the Excel file → migration-data JSON
 *   3. Migrate borrowers, loans, payments, schedules
 *   4. Insert System Auto-Adjustment payments (balance reconciliation)
 *   5. Fix deducted_amount / cycle / is_reloan on all loans
 *
 * Business rules baked in:
 *   - deducted_amount on a reloan = previous loan's remaining balance at time of new loan
 *     (i.e. total_due - regular_payments_only, excluding rollover & auto-adj artifacts)
 *   - Previous-loan balance is settled by rollover payments on the old loan AND
 *     reflected as deducted_amount on the new loan so Net Loan Released is correct
 *   - Net Loan Released = principal_amount - deducted_amount
 *   - cycle and is_reloan are set by traversing the renewal chain chronologically
 *
 * Usage:
 *   node scripts/full-reset-migrate.mjs --target local              # dry-run
 *   node scripts/full-reset-migrate.mjs --target local  --confirm   # live run
 *   node scripts/full-reset-migrate.mjs --target remote --confirm   # remote
 *
 * Excel source:
 *   files (1)/DCM-as-of-May-30.xlsx  (sheet: "DATA of Clients")
 */

import pg from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import XLSX from 'xlsx';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const EXCEL_PATH = path.resolve(__dirname, '..', 'files (1)', 'DCM-as-of-May-30.xlsx');
const DATA_DIR   = path.resolve(__dirname, 'migration-data');

// ─── CLI args ────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const targetIdx = args.indexOf('--target');
const TARGET  = targetIdx >= 0 ? args[targetIdx + 1] : 'local';
const SKIP_CLEAR   = args.includes('--skip-clear');
const SKIP_EXTRACT = args.includes('--skip-extract');

// ─── DB Config ───────────────────────────────────────────────────────────────
function getDbConfig() {
  if (TARGET === 'local') {
    return {
      host:     process.env.SUPABASE_DB_HOST     || '127.0.0.1',
      port:     Number(process.env.SUPABASE_DB_PORT || '55322'),
      database: process.env.SUPABASE_DB_NAME     || 'postgres',
      user:     process.env.SUPABASE_DB_USER     || 'postgres',
      password: process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD
             || process.env.SUPABASE_DB_PASSWORD
             || 'postgres',
    };
  } else {
    const host     = process.env.REMOTE_DB_HOST;
    const password = process.env.REMOTE_DB_PASSWORD;
    if (!host || !password) {
      console.error('❌ Set REMOTE_DB_HOST and REMOTE_DB_PASSWORD in .env for remote target.');
      process.exit(1);
    }
    return {
      host, password,
      port:     Number(process.env.REMOTE_DB_PORT || '5432'),
      database: process.env.REMOTE_DB_NAME || 'postgres',
      user:     process.env.REMOTE_DB_USER || 'postgres',
      ssl: { rejectUnauthorized: false },
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function uuid(seed) {
  const h = crypto.createHash('md5').update(seed).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}

function num(v)       { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function slugify(n)   { return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

const COLLECTOR_MAP = {
  'cesencio junco':  'Cresencio Junco',
  'cresencio junco': 'Cresencio Junco',
  'jayson cayanong': 'Jason Cayanong',
  'jason cayanong':  'Jason Cayanong',
  'gerald gera':     'Gerald Gera',
  'gerald  gera':    'Gerald Gera',
  'gera gerald':     'Gerald Gera',
  'bernie casera':   'Bernie Casera',
  'office':          'Office',
};
const NAME_MAP = {
  'miraluna p. manoza':          'miraluna p. mañoza',
  'denaro a. manlucot':          'genaro a. manlucot',
  'lorena cagabhion malayan':    'lorina cagabhion malayan',
};
const SKIP_NAME_RE = /^(Total|Grand|Sum|Overall|Batch|Name Of Client)/i;

function normCollector(raw) {
  if (!raw) return null;
  const k = String(raw).trim().replace(/\s+/g,' ').toLowerCase();
  return COLLECTOR_MAP[k] || k.replace(/\b\w/g, c => c.toUpperCase());
}
function cleanName(raw) {
  if (!raw) return null;
  const t = String(raw).trim().replace(/\s+/g,' ');
  if (!t || SKIP_NAME_RE.test(t)) return null;
  const l = t.toLowerCase();
  if (NAME_MAP[l]) return NAME_MAP[l].replace(/\b\w/g, c => c.toUpperCase());
  return t;
}
function cleanPhone(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (/^n\/?a$/i.test(s) || s==='0' || s==='') return null;
  s = s.replace(/[^0-9]/g,'');
  return s.startsWith('0') ? s.slice(1) : s || null;
}
function excelDate(serial) {
  if (!serial) return null;
  if (typeof serial === 'number') {
    return new Date((serial - 25569) * 86400000).toISOString().slice(0,10);
  }
  if (typeof serial === 'string') {
    const d = new Date(serial);
    return isNaN(d) ? null : d.toISOString().slice(0,10);
  }
  return null;
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
function splitName(full) {
  if (!full) return { first_name:'', last_name:'' };
  if (full.includes(',')) {
    const [last,...rest] = full.split(',').map(s=>s.trim());
    return { first_name: rest.join(' ').trim(), last_name: last };
  }
  const parts = full.split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name:'' };
  const last = parts.pop(); return { first_name: parts.join(' '), last_name: last };
}

// ─── STEP 1: Extract & clean Excel ───────────────────────────────────────────
function extractExcel() {
  console.log('\n━━━ STEP 1: Extracting Excel data ━━━');
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error(`❌ Excel not found: ${EXCEL_PATH}`);
    process.exit(1);
  }

  const wb   = XLSX.readFile(EXCEL_PATH);
  const sheet = wb.Sheets['DATA of Clients'];
  if (!sheet) { console.error('❌ Sheet "DATA of Clients" not found'); process.exit(1); }

  const rows = XLSX.utils.sheet_to_json(sheet, { header:1, defval: null });
  console.log(`   Total rows: ${rows.length}`);

  const headerIdxs = rows.reduce((acc, row, i) => {
    if (row?.[0] && String(row[0]).trim() === 'Name Of Client') acc.push(i);
    return acc;
  }, []);
  console.log(`   Sections (batch headers): ${headerIdxs.length}`);

  const allLoans    = [];
  const allPayments = [];

  for (let si = 0; si < headerIdxs.length; si++) {
    const hIdx    = headerIdxs[si];
    const nextIdx = si + 1 < headerIdxs.length ? headerIdxs[si+1] : rows.length;

    // detect batch label
    let batchLabel = null;
    for (let off = 1; off <= 3; off++) {
      const v = rows[hIdx - off]?.[0];
      if (v) { const m = String(v).match(/Batch\s+(\d+)/i); if (m) { batchLabel = parseInt(m[1]); break; } }
    }

    // detect date columns from header row
    const dateCols = [];
    const hRow = rows[hIdx] || [];
    for (let c = 19; c <= 100; c++) {
      const v = hRow[c];
      if (v && typeof v === 'number' && v > 1) {
        const iso = excelDate(v);
        if (iso) dateCols.push({ colIdx: c, isoDate: iso });
      }
    }

    for (let r = hIdx + 1; r < nextIdx; r++) {
      const row = rows[r];
      if (!row) continue;
      const fullName = cleanName(row[0]);
      if (!fullName) continue;

      const collector  = normCollector(row[5]);
      const batch      = parseInt(row[7]) || batchLabel || null;
      const cycle      = parseInt(row[8]) || null;
      const days       = parseInt(row[6]) || 40;
      let   releaseDate = excelDate(row[9]);
      let   endDate    = excelDate(row[10]);

      // fix year-typo (2016 instead of 2026)
      if (releaseDate && (releaseDate.startsWith('2016-') || releaseDate > '2026-05-31')) {
        const endSerial = num(row[10]);
        if (endSerial > 45000) releaseDate = excelDate(endSerial - days);
      }

      // Fix maturity date earlier than release date typos (Excel DD/MM/YYYY vs MM/DD/YYYY parsing issues)
      if (releaseDate && endDate && endDate < releaseDate) {
        // 1. Month/Day swaps (e.g., July 12 2025 -> December 7 2025)
        const [y, m, d] = endDate.split('-').map(Number);
        if (m <= 12 && d <= 12) {
          const swappedDateStr = `${y}-${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`;
          if (swappedDateStr >= releaseDate) {
            console.log(`   [Date Auto-Correct] Row ${r + 1} (${fullName}) Month/Day Swap: ${endDate} ➔ ${swappedDateStr}`);
            endDate = swappedDateStr;
          }
        }

        // 2. Off-by-one-year typos (e.g., Feb 17 2025 -> Feb 17 2026 for Dec 2025 loans)
        if (endDate < releaseDate) {
          const [y, m, d] = endDate.split('-').map(Number);
          const plusOneYearStr = `${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          if (plusOneYearStr >= releaseDate) {
            console.log(`   [Date Auto-Correct] Row ${r + 1} (${fullName}) Year +1: ${endDate} ➔ ${plusOneYearStr}`);
            endDate = plusOneYearStr;
          }
        }
      }

      const loanAmount       = num(row[11]);
      const dailyInstallment = num(row[12]);
      const interest         = num(row[13]);
      const totalPayment     = num(row[14]);
      const netLoan          = num(row[15]);
      const insurance        = num(row[16]);
      const totalLoan        = num(row[17]);
      const totalLoanBalance = num(row[18]);

      // Recompute Maturity Date programmatically based on releaseDate and terms (days), skipping Sundays
      if (releaseDate) {
        const calc = computeMaturityDateAndSchedules(releaseDate, days, dailyInstallment);
        if (calc.maturityDate) {
          endDate = calc.maturityDate;
        }
      }

      const status = loanAmount === 0 ? 'unknown' : totalLoanBalance <= 0 ? 'paid' : 'active';
      const nameSlug = slugify(fullName);
      const loanRef  = `loan-${nameSlug}-b${batch??0}-c${cycle??0}-r${r}`;

      allLoans.push({
        ref_id: loanRef, borrower_ref: `borrower-${nameSlug}`,
        _full_name: fullName, _address: row[1] ? String(row[1]).trim() : null,
        _phone: cleanPhone(row[2]), _business: row[4] ? String(row[4]).trim() : null,
        _co_maker_name: row[3] ? String(row[3]).trim() : null,
        collector, batch, cycle, days, release_date: releaseDate, end_date: endDate,
        loan_amount: loanAmount, daily_installment: dailyInstallment,
        interest, total_payment: totalPayment, net_loan: netLoan,
        insurance, total_loan: totalLoan, total_loan_balance: totalLoanBalance,
        status, previous_loan_ref: null, is_reloan: false, source_row: r + 1,
      });

      for (const dc of dateCols) {
        const amt = num(row[dc.colIdx]);
        if (amt > 0) allPayments.push({
          loan_ref: loanRef, borrower_ref: `borrower-${nameSlug}`,
          amount: amt, payment_date: dc.isoDate, collector,
        });
      }
    }
  }

  // Deduplicate borrowers
  const borrowerMap = new Map();
  for (const loan of allLoans) {
    const slug = loan.borrower_ref.replace(/^borrower-/, '');
    if (!borrowerMap.has(slug)) {
      const { first_name, last_name } = splitName(loan._full_name);
      borrowerMap.set(slug, {
        ref_id: `borrower-${slug}`, full_name: loan._full_name,
        first_name, last_name, address: loan._address, phone: loan._phone,
        business: loan._business, co_maker_name: loan._co_maker_name,
        collector: loan.collector, loan_count: 0,
      });
    }
    borrowerMap.get(slug).loan_count++;
  }

  // Link reloans chronologically
  const loansByBorrower = new Map();
  for (const loan of allLoans) {
    if (!loansByBorrower.has(loan.borrower_ref)) loansByBorrower.set(loan.borrower_ref, []);
    loansByBorrower.get(loan.borrower_ref).push(loan);
  }
  let reloanCount = 0;
  for (const [, bLoans] of loansByBorrower) {
    if (bLoans.length < 2) continue;
    bLoans.sort((a, b) => {
      if (!a.release_date && !b.release_date) return 0;
      if (!a.release_date) return -1;
      if (!b.release_date) return 1;
      return a.release_date.localeCompare(b.release_date);
    });
    for (let i = 1; i < bLoans.length; i++) {
      bLoans[i].previous_loan_ref = bLoans[i-1].ref_id;
      bLoans[i].is_reloan = true;
      bLoans[i-1].status = 'paid';

      // Rollover: previous loan's remaining balance becomes a payment on the old loan
      // AND is recorded as deducted_amount on the new loan (Net Loan Released = Principal - Rollover)
      const rollover = bLoans[i-1].total_loan_balance;
      if (rollover > 0) {
        const payDate = bLoans[i].release_date || bLoans[i-1].end_date || '2026-05-30';
        allPayments.push({
          loan_ref: bLoans[i-1].ref_id,
          borrower_ref: bLoans[i-1].borrower_ref,
          amount: rollover,
          payment_date: payDate,
          collector: bLoans[i-1].collector,
          notes: 'Rollover settlement to new loan',
        });
        bLoans[i-1].total_loan_balance = 0;
        // Deduct from new loan's principal — borrower receives net amount
        bLoans[i].deducted_amount = rollover;
      } else {
        bLoans[i].deducted_amount = 0;
      }
      reloanCount++;
    }
  }

  // Strip private fields
  const cleanLoans = allLoans.map(l => {
    const { _full_name, _address, _phone, _business, _co_maker_name, ...rest } = l;
    return rest;
  });
  const borrowers = [...borrowerMap.values()];

  // Write JSON
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'borrowers.json'), JSON.stringify(borrowers, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'loans.json'),     JSON.stringify(cleanLoans, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'payments.json'),  JSON.stringify(allPayments, null, 2));
  const summary = {
    total_borrowers: borrowers.length, total_loans: cleanLoans.length,
    total_payments: allPayments.length,
    total_principal: cleanLoans.reduce((s,l) => s + l.loan_amount, 0),
    total_principal_with_interest: cleanLoans.reduce((s,l) => s + l.total_loan, 0),
    reloans_linked: reloanCount, generated_at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(DATA_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log(`   ✅ ${borrowers.length} borrowers, ${cleanLoans.length} loans, ${allPayments.length} payments`);
  console.log(`   ✅ ${reloanCount} reloans linked`);
  return { borrowers, loans: cleanLoans, payments: allPayments, summary };
}

// ─── STEP 2: Clear target DB ─────────────────────────────────────────────────
const TABLES_TO_CLEAR = [
  'app_payment_schedules', 'app_payments', 'app_loan_penalties',
  'app_collection_logs', 'app_savings_transactions', 'app_loans',
  'app_borrowers', 'app_bank_transactions', 'app_bank_accounts',
  'app_expenses', 'app_recurring_expenses', 'app_cash_transactions',
  'app_financial_snapshots', 'app_remittances', 'app_action_logs',
  'app_expense_categories', 'collection_groups',
];

async function clearDB(client) {
  console.log('\n━━━ STEP 2: Clearing DB ━━━');
  for (const table of TABLES_TO_CLEAR) {
    try {
      const r = await client.query(`DELETE FROM public.${table}`);
      console.log(`   🗑️  ${table.padEnd(32)} ${r.rowCount} rows deleted`);
    } catch (e) {
      console.log(`   ⚠️  ${table.padEnd(32)} skip (${e.message.slice(0, 60)})`);
    }
  }
  console.log('   ✅ DB cleared');
}

// ─── STEP 3: Migrate data ────────────────────────────────────────────────────
async function migrateData(client, borrowers, loans, payments) {
  console.log('\n━━━ STEP 3: Migrating data ━━━');
  const CHUNK = 100;

  // 3a. Collectors
  console.log('   Setting up collectors...');
  const { rows: existingCols } = await client.query('SELECT id, full_name FROM public.app_collectors');
  const collectorMap = {};
  for (const c of existingCols) collectorMap[c.full_name.toLowerCase()] = c.id;

  const neededCollectors = [...new Set([
    ...borrowers.map(b => b.collector),
    ...loans.map(l => l.collector),
  ].filter(Boolean))];

  for (const name of neededCollectors) {
    if (!collectorMap[name.toLowerCase()]) {
      const id = uuid(`collector-${name}`);
      await client.query(
        `INSERT INTO public.app_collectors (id, full_name, is_active, created_at, updated_at)
         VALUES ($1, $2, true, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
        [id, name]
      );
      collectorMap[name.toLowerCase()] = id;
      console.log(`   ➕ Collector: ${name}`);
    }
  }

  // 3b. Borrowers
  console.log(`   Inserting ${borrowers.length} borrowers...`);
  const borrowerIdMap = {};
  for (let i = 0; i < borrowers.length; i += CHUNK) {
    const chunk = borrowers.slice(i, i + CHUNK);
    const vals = []; const params = []; let pi = 1;
    for (const b of chunk) {
      const id = uuid(`borrower-may30-${b.ref_id}`);
      borrowerIdMap[b.ref_id] = id;
      const cId = collectorMap[(b.collector || '').toLowerCase()] || null;
      vals.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},NOW(),NOW())`);
      params.push(id, b.full_name, b.first_name||null, b.last_name||null,
        b.address||null, b.phone||null, b.business||null, b.co_maker_name||null, cId, 'Daily');
    }
    await client.query(
      `INSERT INTO public.app_borrowers (id,full_name,first_name,last_name,address,phone,business,co_maker_name,collector_id,"group",created_at,updated_at)
       VALUES ${vals.join(',')} ON CONFLICT (id) DO NOTHING`, params
    );
  }
  console.log(`   ✅ ${borrowers.length} borrowers inserted`);

  // 3c. Loans
  console.log(`   Inserting ${loans.length} loans...`);
  const loanIdMap = {};
  for (const l of loans) loanIdMap[l.ref_id] = uuid(`loan-may30-${l.ref_id}`);

  let loanNum = 0;
  for (let i = 0; i < loans.length; i += CHUNK) {
    const chunk = loans.slice(i, i + CHUNK);
    const vals = []; const params = []; let pi = 1;
    for (const l of chunk) {
      loanNum++;
      const id         = loanIdMap[l.ref_id];
      const borrowerId = borrowerIdMap[l.borrower_ref];
      const cId        = collectorMap[(l.collector || '').toLowerCase()] || null;
      const prevId     = l.previous_loan_ref ? loanIdMap[l.previous_loan_ref] || null : null;
      const loanNumber = `LN-2025-MAY30-${String(loanNum).padStart(4,'0')}`;
      const intRate    = l.loan_amount > 0 ? ((l.interest || 0) / l.loan_amount) * 100 : 0;
      const status     = l.status === 'paid' ? 'paid' : (l.loan_amount === 0 ? 'paid' : 'active');

      // deducted_amount = previous loan's remaining balance at time of new loan issue
      // For root loans = 0. For reloans = rollover amount baked in during extraction.
      const deductedAmount = l.deducted_amount ?? 0;

      vals.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},NOW(),NOW())`);
      params.push(
        id, borrowerId, loanNumber,
        l.loan_amount || 0,        // principal_amount
        intRate,                    // interest_rate
        'flat',                     // interest_type
        l.days || 40,               // term
        'days',                     // term_unit
        'daily',                    // frequency
        l.total_loan || 0,          // total_amount
        l.daily_installment || 0,   // installment_amount
        l.insurance || 0,           // insurance_amount
        deductedAmount,             // deducted_amount ← rollover balance for reloans, 0 for roots
        l.release_date || null,     // release_date
        l.end_date || null,         // maturity_date
        cId,                        // collector_id
        status,                     // status
        l.batch || null,            // batch
        l.cycle || null,            // cycle
        prevId,                     // previous_loan_id
      );
    }
    await client.query(
      `INSERT INTO public.app_loans (id,borrower_id,loan_number,principal_amount,interest_rate,interest_type,term,term_unit,frequency,total_amount,installment_amount,insurance_amount,deducted_amount,release_date,maturity_date,collector_id,status,batch,cycle,previous_loan_id,created_at,updated_at)
       VALUES ${vals.join(',')} ON CONFLICT (id) DO NOTHING`, params
    );
  }
  console.log(`   ✅ ${loans.length} loans inserted`);

  // 3d. Payments
  console.log(`   Inserting ${payments.length} payments...`);
  for (let i = 0; i < payments.length; i += CHUNK) {
    const chunk = payments.slice(i, i + CHUNK);
    const vals = []; const params = []; let pi = 1;
    for (const p of chunk) {
      const loanId = loanIdMap[p.loan_ref];
      if (!loanId) continue;
      const id  = uuid(`payment-may30-${p.loan_ref}-${p.payment_date}-${p.amount}-${p.notes||''}`);
      const cId = collectorMap[(p.collector || '').toLowerCase()] || null;
      vals.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},NOW(),NOW())`);
      params.push(id, loanId, p.amount || 0, p.payment_date || null, cId, p.notes || null);
    }
    if (vals.length > 0) await client.query(
      `INSERT INTO public.app_payments (id,loan_id,amount,payment_date,collector_id,notes,created_at,updated_at)
       VALUES ${vals.join(',')} ON CONFLICT (id) DO NOTHING`, params
    );
  }
  console.log(`   ✅ ${payments.length} payments inserted`);

  // 3e. Payment schedules for active loans
  console.log('   Generating payment schedules for active loans...');
  const activeLoans = loans.filter(l => l.status === 'active' && l.loan_amount > 0);
  let schedCount = 0;
  for (let i = 0; i < activeLoans.length; i += 10) {
    const chunk = activeLoans.slice(i, i + 10);
    for (const l of chunk) {
      const loanId = loanIdMap[l.ref_id];
      if (!l.release_date || !l.daily_installment) continue;
      const calc = computeMaturityDateAndSchedules(l.release_date, l.days || 40, l.daily_installment);
      const vals = []; const params = []; let pi = 1;
      for (const s of calc.schedules) {
        const sid = uuid(`schedule-may30-${l.ref_id}-day${s.number}`);
        vals.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},NOW(),NOW())`);
        params.push(sid, loanId, s.scheduledAmount, s.dueDate, 'pending');
        schedCount++;
      }
      if (vals.length > 0) await client.query(
        `INSERT INTO public.app_payment_schedules (id,loan_id,scheduled_amount,due_date,status,created_at,updated_at)
         VALUES ${vals.join(',')} ON CONFLICT (id) DO NOTHING`, params
      );
    }
  }
  console.log(`   ✅ ${schedCount} payment schedules generated`);

  return { loanIdMap };
}

// ─── STEP 4: Auto-adjust balances ────────────────────────────────────────────
async function autoAdjustBalances(client, loans, loanIdMap) {
  console.log('\n━━━ STEP 4: Auto-adjusting balances ━━━');

  // Get current sums from DB
  const { rows: sums } = await client.query(`
    SELECT l.id, l.total_amount, l.collector_id,
           COALESCE(SUM(p.amount), 0) AS paid
    FROM public.app_loans l
    LEFT JOIN public.app_payments p ON l.id = p.loan_id AND p.deleted_at IS NULL
    WHERE l.deleted_at IS NULL
    GROUP BY l.id, l.total_amount, l.collector_id
  `);
  const sumMap = Object.fromEntries(sums.map(r => [r.id, r]));

  const adjustments = [];
  for (const l of loans) {
    const expected = l.total_loan_balance ?? 0;
    const id = loanIdMap[l.ref_id];
    const row = sumMap[id];
    if (!row) continue;
    const balance = Number(row.total_amount) - Number(row.paid);
    const diff = balance - expected;
    if (diff > 0.02) {
      adjustments.push({
        id:            uuid(`adj-may30-${l.ref_id}`),
        loan_id:       id,
        amount:        diff,  // payment reduces balance; diff > 0 means DB balance was too high -> positive payment to reduce it
        payment_date:  '2026-05-30',
        notes:         'System Auto-Adjustment to match legacy Excel balance',
        collector_id:  row.collector_id,
      });
    }
  }

  if (adjustments.length === 0) {
    console.log('   ✅ No adjustments needed');
    return;
  }

  console.log(`   Inserting ${adjustments.length} adjustment payments...`);
  const CHUNK = 500;
  for (let i = 0; i < adjustments.length; i += CHUNK) {
    const batch = adjustments.slice(i, i + CHUNK);
    const vals = []; const params = []; let pi = 1;
    for (const a of batch) {
      vals.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},NOW(),NOW())`);
      params.push(a.id, a.loan_id, a.amount, a.payment_date, a.notes, a.collector_id);
    }
    await client.query(
      `INSERT INTO public.app_payments (id,loan_id,amount,payment_date,notes,collector_id,created_at,updated_at)
       VALUES ${vals.join(',')} ON CONFLICT (id) DO NOTHING`, params
    );
  }
  console.log(`   ✅ ${adjustments.length} balance adjustments applied`);
}

// ─── STEP 5: Fix cycles, is_reloan & deducted_amount ────────────────────────
async function fixCyclesAndFlags(client) {
  console.log('\n━━━ STEP 5: Fixing cycles, is_reloan & deducted_amount ━━━');

  const { rows: loans } = await client.query(`
    SELECT id, borrower_id, cycle, is_reloan, previous_loan_id,
           deducted_amount::numeric, total_amount::numeric
    FROM public.app_loans WHERE deleted_at IS NULL ORDER BY release_date ASC
  `);

  const { rows: payments } = await client.query(`
    SELECT loan_id, amount::numeric, notes
    FROM public.app_payments WHERE deleted_at IS NULL
  `);

  const paysByLoan = {};
  for (const p of payments) {
    if (!paysByLoan[p.loan_id]) paysByLoan[p.loan_id] = [];
    paysByLoan[p.loan_id].push(p);
  }

  const loanById  = Object.fromEntries(loans.map(l => [l.id, l]));
  const byBorrower = {};
  for (const l of loans) {
    if (!byBorrower[l.borrower_id]) byBorrower[l.borrower_id] = [];
    byBorrower[l.borrower_id].push(l);
  }

  const updates = [];
  for (const bLoans of Object.values(byBorrower)) {
    const idSet = new Set(bLoans.map(l => l.id));
    const roots = bLoans.filter(l => !l.previous_loan_id || !idSet.has(l.previous_loan_id));
    for (const root of roots) {
      let cur = root; let cyc = 1;
      while (cur) {
        const expectedIsReloan = cyc > 1;

        // Compute expected deducted_amount from previous loan's real balance
        let expectedDeducted = 0;
        if (cur.previous_loan_id) {
          const prev = loanById[cur.previous_loan_id];
          if (prev) {
            const prevPays = paysByLoan[prev.id] ?? [];
            const regularSum = prevPays
              .filter(p => {
                const n = (p.notes || '').toLowerCase();
                return !n.includes('auto-adjustment') && !n.includes('rollover');
              })
              .reduce((s, p) => s + Number(p.amount), 0);
            const prevBalance = Number(prev.total_amount) - regularSum;
            if (prevBalance > 0.01) expectedDeducted = Math.round(prevBalance * 100) / 100;
          }
        }

        const needsUpdate =
          cur.cycle !== cyc ||
          cur.is_reloan !== expectedIsReloan ||
          Math.abs(Number(cur.deducted_amount) - expectedDeducted) >= 1;

        if (needsUpdate) {
          updates.push({ id: cur.id, cycle: cyc, is_reloan: expectedIsReloan, deducted_amount: expectedDeducted });
        }

        cur = bLoans.find(l => l.previous_loan_id === cur.id);
        cyc++;
      }
    }
  }

  if (updates.length === 0) { console.log('   ✅ All cycles & deductions already correct'); return; }

  console.log(`   Fixing ${updates.length} loans...`);
  for (const u of updates) {
    await client.query(
      `UPDATE public.app_loans SET cycle=$1, is_reloan=$2, deducted_amount=$3, updated_at=NOW() WHERE id=$4`,
      [u.cycle, u.is_reloan, u.deducted_amount, u.id]
    );
  }
  console.log(`   ✅ ${updates.length} loans corrected (cycles + deductions)`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   FULL RESET & MIGRATE — DCM May-30 Excel           ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Target : ${TARGET.padEnd(44)}║`);
  console.log(`║  Mode   : ${(CONFIRM ? '⚠️  LIVE (writes to DB)' : '🔍 DRY RUN (no DB writes)').padEnd(44)}║`);
  console.log('╚══════════════════════════════════════════════════════╝');

  // Step 1: Always extract even in dry-run (safe, just writes JSON files)
  let extracted;
  if (SKIP_EXTRACT) {
    console.log('\n━━━ STEP 1: Skipped (--skip-extract) ━━━');
    const load = f => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
    extracted = { borrowers: load('borrowers.json'), loans: load('loans.json'), payments: load('payments.json') };
    console.log(`   Loaded ${extracted.borrowers.length} borrowers, ${extracted.loans.length} loans, ${extracted.payments.length} payments from cache`);
  } else {
    extracted = extractExcel();
  }

  if (!CONFIRM) {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🔍 DRY RUN complete. JSON files written to scripts/migration-data/');
    console.log('   Review the output, then run with --confirm to apply to DB.');
    console.log('   Add --skip-extract to skip re-parsing the Excel next time.');
    console.log('═══════════════════════════════════════════════════════');
    return;
  }

  const client = new pg.Client(getDbConfig());
  await client.connect();
  console.log(`\n✅ Connected to ${TARGET} database`);

  try {
    // Step 2: Clear
    if (!SKIP_CLEAR) await clearDB(client);
    else console.log('\n━━━ STEP 2: Skipped (--skip-clear) ━━━');

    // Step 3: Migrate
    const { loanIdMap } = await migrateData(client, extracted.borrowers, extracted.loans, extracted.payments);

    // Step 4: Auto-adjust
    await autoAdjustBalances(client, extracted.loans, loanIdMap);

    // Step 5: Fix cycles
    await fixCyclesAndFlags(client);

    // Step 6: Reload schema cache
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('\n✅ PostgREST schema cache reloaded');

    // Final summary
    const { rows: counts } = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM app_borrowers WHERE deleted_at IS NULL) AS borrowers,
        (SELECT COUNT(*) FROM app_loans     WHERE deleted_at IS NULL) AS loans,
        (SELECT COUNT(*) FROM app_payments  WHERE deleted_at IS NULL) AS payments,
        (SELECT COUNT(*) FROM app_payment_schedules WHERE deleted_at IS NULL) AS schedules
    `);
    const c = counts[0];
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║               MIGRATION COMPLETE ✅                  ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  Borrowers         : ${String(c.borrowers).padEnd(34)}║`);
    console.log(`║  Loans             : ${String(c.loans).padEnd(34)}║`);
    console.log(`║  Payments          : ${String(c.payments).padEnd(34)}║`);
    console.log(`║  Payment Schedules : ${String(c.schedules).padEnd(34)}║`);
    console.log('╚══════════════════════════════════════════════════════╝');

  } finally {
    await client.end();
  }
}

main().catch(err => { console.error('\n💥 Fatal:', err.message); process.exit(1); });
