import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.production', override: false });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.production');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const money = (value) => Number(Number(value || 0).toFixed(2));
const parseNumber = (value) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

async function fetchAll(table, select, filter) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (filter) query = filter(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function parseWeeklyExcel() {
  const files = [
    path.resolve('files (1)', 'WEEKLY-DCS-angelica.xlsx'),
    path.resolve('files (1)', 'WEEKLY-DCS-meshelle.xlsx'),
  ];
  const skipRowRe = /^(Name Of Client|Total|Grand Total|Sub.?Total|\s*$)/i;
  const meetingDayRe = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+Meeting$/i;
  const rows = [];

  for (const file of files) {
    const workbook = xlsx.read(fs.readFileSync(file), { type: 'buffer' });
    const sheetName = workbook.SheetNames.find((name) => name.toLowerCase().includes('weekly'));
    const sheetRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    const subHeaderRow = sheetRows[2] || [];
    const maxLength = Math.max(...sheetRows.map((r) => r?.length || 0));
    const principalPaymentCols = [];
    for (let c = 25; c < maxLength; c++) {
      if (String(subHeaderRow[c] || '').trim().toLowerCase() === 'prin') {
        principalPaymentCols.push(c);
      }
    }

    for (let r = 4; r < sheetRows.length; r++) {
      const row = sheetRows[r] || [];
      const name = String(row[0] || '').trim();
      if (!name || skipRowRe.test(name) || meetingDayRe.test(name)) continue;
      const principal = parseNumber(row[10]);
      if (!principal) continue;
      const interest = parseNumber(row[16]);
      const total = principal + interest;
      const principalPaid = principalPaymentCols.reduce((sum, c) => sum + parseNumber(row[c]), 0);
      const paid = principalPaymentCols.reduce((sum, c) => sum + parseNumber(row[c + 3]), 0);
      rows.push({
        name,
        sourceFile: path.basename(file),
        principal: money(principal),
        total: money(total),
        principalPaid: money(principalPaid),
        paid: money(paid),
        balance: money(Math.max(0, total - paid)),
      });
    }
  }

  return rows;
}

function summarize(rows) {
  return {
    count: rows.length,
    principal: money(rows.reduce((s, r) => s + Number(r.principal || 0), 0)),
    total: money(rows.reduce((s, r) => s + Number(r.total || 0), 0)),
    paid: money(rows.reduce((s, r) => s + Number(r.paid || 0), 0)),
    principalPaid: money(rows.reduce((s, r) => s + Number(r.principalPaid || 0), 0)),
    balance: money(rows.reduce((s, r) => s + Number(r.balance || 0), 0)),
  };
}

async function main() {
  const dailyLoans = JSON.parse(fs.readFileSync(path.resolve('scripts/migration-data/loans.json'), 'utf8'));
  const dailyPayments = JSON.parse(fs.readFileSync(path.resolve('scripts/migration-data/payments.json'), 'utf8'));
  const weeklyExcel = parseWeeklyExcel();

  const dbLoans = await fetchAll(
    'app_loans',
    'id,loan_number,principal_amount,total_amount,status,frequency,deleted_at',
    (q) => q.is('deleted_at', null)
  );
  const dbPayments = await fetchAll(
    'app_payments',
    'id,loan_id,amount,deleted_at',
    (q) => q.is('deleted_at', null)
  );

  const paidByLoan = new Map();
  for (const payment of dbPayments) {
    paidByLoan.set(payment.loan_id, money((paidByLoan.get(payment.loan_id) || 0) + Number(payment.amount || 0)));
  }

  const dbDaily = dbLoans
    .filter((loan) => !String(loan.loan_number || '').startsWith('LN-WKLY-'))
    .map((loan) => {
      const paid = paidByLoan.get(loan.id) || 0;
      const total = Number(loan.total_amount || 0);
      return {
        principal: money(loan.principal_amount),
        total: money(total),
        paid,
        balance: money(Math.max(0, total - paid)),
      };
    });

  const dbWeekly = dbLoans
    .filter((loan) => String(loan.loan_number || '').startsWith('LN-WKLY-'))
    .map((loan) => {
      const paid = paidByLoan.get(loan.id) || 0;
      const total = Number(loan.total_amount || 0);
      return {
        principal: money(loan.principal_amount),
        total: money(total),
        paid,
        balance: money(Math.max(0, total - paid)),
      };
    });

  const dailyPaidByRef = new Map();
  for (const payment of dailyPayments) {
    dailyPaidByRef.set(payment.loan_ref, money((dailyPaidByRef.get(payment.loan_ref) || 0) + Number(payment.amount || 0)));
  }
  const dailyExcel = dailyLoans.map((loan) => ({
    principal: money(loan.loan_amount),
    total: money(loan.total_loan),
    paid: dailyPaidByRef.get(loan.ref_id) || 0,
    balance: money(loan.total_loan_balance),
  }));

  const report = {
    timestamp: new Date().toISOString(),
    source: supabaseUrl,
    daily: {
      excel: summarize(dailyExcel),
      app: summarize(dbDaily),
    },
    weekly: {
      excel: summarize(weeklyExcel),
      app: summarize(dbWeekly),
    },
  };

  for (const section of ['daily', 'weekly']) {
    report[section].difference = Object.fromEntries(
      ['count', 'principal', 'total', 'paid', 'balance'].map((key) => [
        key,
        money(report[section].excel[key] - report[section].app[key]),
      ])
    );
  }

  fs.writeFileSync(
    path.resolve('scripts/deployed-app-excel-verification-report.json'),
    JSON.stringify(report, null, 2)
  );

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
