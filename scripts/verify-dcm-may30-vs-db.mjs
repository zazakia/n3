import pg from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, 'migration-data');

// --- CLI Args ---
const args = process.argv.slice(2);
const targetIdx = args.indexOf('--target');
const TARGET = targetIdx >= 0 ? args[targetIdx + 1] : 'local';

// --- DB Config ---
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

// --- MD5 UUID Helper ---
function uuid(seed) {
  const h = crypto.createHash('md5').update(seed).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}

function formatDate(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date) return dateVal.toISOString().slice(0, 10);
  return String(dateVal).split('T')[0];
}

async function verify() {
  console.log('====================================================================');
  console.log('🔍 DEEP DATA DIAGNOSTIC: Excel vs. Supabase Database');
  console.log(`   Target DB: ${TARGET}`);
  console.log('====================================================================\n');

  // 1. Read Excel Extracted JSON files
  const excelBorrowers = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'borrowers.json'), 'utf-8'));
  const excelLoans = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'loans.json'), 'utf-8'));
  const excelPayments = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'payments.json'), 'utf-8'));

  // 2. Connect to the DB
  const client = new pg.Client(getDbConfig());
  await client.connect();

  try {
    // 3. Fetch all DB data
    const { rows: dbBorrowers } = await client.query('SELECT * FROM public.app_borrowers WHERE deleted_at IS NULL');
    const { rows: dbLoans } = await client.query('SELECT * FROM public.app_loans WHERE deleted_at IS NULL');
    const { rows: dbPayments } = await client.query('SELECT * FROM public.app_payments WHERE deleted_at IS NULL');

    // Create DB lookup maps by ID
    const dbBorrowerMap = new Map(dbBorrowers.map(b => [b.id, b]));
    const dbLoanMap = new Map(dbLoans.map(l => [l.id, l]));
    const dbPaymentMap = new Map(dbPayments.map(p => [p.id, p]));

    // Track field discrepancy counts
    const loanFieldDiscrepancyCounts = {};
    const loanMismatches = [];
    const activeBalanceDiscrepancies = [];

    // Map borrowers for name lookup
    const borrowerRefNameMap = new Map(excelBorrowers.map(b => [b.ref_id, b.full_name]));

    // ─── LOANS CHECK ───
    for (const el of excelLoans) {
      const expectedId = uuid(`loan-may30-${el.ref_id}`);
      const dbl = dbLoanMap.get(expectedId);

      if (!dbl) continue;

      const diffs = {};
      const numCmp = (field, exVal, dbVal, tolerance = 0.01) => {
        const exNum = parseFloat(exVal || 0);
        const dbNum = parseFloat(dbVal || 0);
        if (Math.abs(exNum - dbNum) > tolerance) {
          diffs[field] = { excel: exNum, db: dbNum };
          loanFieldDiscrepancyCounts[field] = (loanFieldDiscrepancyCounts[field] || 0) + 1;
        }
      };

      numCmp('principal_amount', el.loan_amount, dbl.principal_amount);
      numCmp('total_amount', el.total_loan, dbl.total_amount);
      numCmp('installment_amount', el.daily_installment, dbl.installment_amount);
      numCmp('insurance_amount', el.insurance, dbl.insurance_amount);
      numCmp('deducted_amount', el.deducted_amount, dbl.deducted_amount, 0.1);

      if (el.days !== dbl.term) {
        diffs.term = { excel: el.days, db: dbl.term };
        loanFieldDiscrepancyCounts.term = (loanFieldDiscrepancyCounts.term || 0) + 1;
      }
      if (formatDate(el.release_date) !== formatDate(dbl.release_date)) {
        diffs.release_date = { excel: formatDate(el.release_date), db: formatDate(dbl.release_date) };
        loanFieldDiscrepancyCounts.release_date = (loanFieldDiscrepancyCounts.release_date || 0) + 1;
      }
      if (formatDate(el.end_date) !== formatDate(dbl.maturity_date)) {
        diffs.maturity_date = { excel: formatDate(el.end_date), db: formatDate(dbl.maturity_date) };
        loanFieldDiscrepancyCounts.maturity_date = (loanFieldDiscrepancyCounts.maturity_date || 0) + 1;
      }
      if (el.status !== dbl.status) {
        diffs.status = { excel: el.status, db: dbl.status };
        loanFieldDiscrepancyCounts.status = (loanFieldDiscrepancyCounts.status || 0) + 1;
      }
      if (el.batch !== dbl.batch) {
        diffs.batch = { excel: el.batch, db: dbl.batch };
        loanFieldDiscrepancyCounts.batch = (loanFieldDiscrepancyCounts.batch || 0) + 1;
      }
      if (el.cycle !== dbl.cycle) {
        diffs.cycle = { excel: el.cycle, db: dbl.cycle };
        loanFieldDiscrepancyCounts.cycle = (loanFieldDiscrepancyCounts.cycle || 0) + 1;
      }
      if (el.is_reloan !== dbl.is_reloan) {
        diffs.is_reloan = { excel: el.is_reloan, db: dbl.is_reloan };
        loanFieldDiscrepancyCounts.is_reloan = (loanFieldDiscrepancyCounts.is_reloan || 0) + 1;
      }

      if (Object.keys(diffs).length > 0) {
        loanMismatches.push({ ref_id: el.ref_id, row: el.source_row, borrower_ref: el.borrower_ref, diffs });
      }

      // Check balance details if active
      if (el.status === 'active') {
        const expectedExcelBalance = parseFloat(el.total_loan_balance || 0);
        
        // Compute actual DB balance for this loan
        const loanPayments = dbPayments.filter(p => p.loan_id === expectedId);
        const totalPaidInDb = loanPayments.reduce((s, p) => s + parseFloat(p.amount), 0);
        const actualDbBalance = parseFloat(dbl.total_amount) - totalPaidInDb;
        const balDiff = expectedExcelBalance - actualDbBalance;

        if (Math.abs(balDiff) > 0.01) {
          activeBalanceDiscrepancies.push({
            row: el.source_row,
            ref_id: el.ref_id,
            borrower_name: borrowerRefNameMap.get(el.borrower_ref) || 'Unknown',
            excel_balance: expectedExcelBalance,
            db_balance: actualDbBalance,
            difference: balDiff,
            db_total_amount: parseFloat(dbl.total_amount),
            db_total_paid: totalPaidInDb,
            payments_count: loanPayments.length,
            payments: loanPayments.map(p => ({ date: formatDate(p.payment_date), amount: parseFloat(p.amount), notes: p.notes }))
          });
        }
      }
    }

    console.log('=== LOAN FIELD MISMATCH FREQUENCY ===');
    const sortedFields = Object.entries(loanFieldDiscrepancyCounts).sort((a,b) => b[1] - a[1]);
    for (const [field, count] of sortedFields) {
      console.log(`  ${field.padEnd(20)}: ${count} occurrences`);
    }

    console.log(`\n=== ACTIVE LOAN BALANCE MISMATCH DETAILS (Total: ${activeBalanceDiscrepancies.length}) ===`);
    activeBalanceDiscrepancies.sort((a,b) => Math.abs(b.difference) - Math.abs(a.difference));
    for (const d of activeBalanceDiscrepancies) {
      console.log(`\nRow ${d.row}: ${d.borrower_name} (Ref: ${d.ref_id})`);
      console.log(`  Excel Balance: ₱${d.excel_balance.toFixed(2)}`);
      console.log(`  DB Balance:    ₱${d.db_balance.toFixed(2)} (Total Amount: ₱${d.db_total_amount.toFixed(2)} - Paid: ₱${d.db_total_paid.toFixed(2)})`);
      console.log(`  Difference:    ₱${d.difference.toFixed(2)} (Excel is higher by ₱${d.difference.toFixed(2)})`);
      console.log(`  Payments count in DB: ${d.payments_count}`);
      d.payments.forEach(p => {
        if (p.notes) {
          console.log(`    - Payment: ₱${p.amount.toFixed(2)} on ${p.date} (${p.notes})`);
        } else {
          console.log(`    - Payment: ₱${p.amount.toFixed(2)} on ${p.date}`);
        }
      });
    }

  } finally {
    await client.end();
  }
}

verify().catch(console.error);
