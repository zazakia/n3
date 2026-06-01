/**
 * Read-only reconciliation for DCM-as-of-May-1.xlsx vs app loan balances.
 *
 * App balance is computed the same way the app/report scripts do:
 *   app_loans.total_amount - sum(non-deleted app_payments.amount)
 */
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { Client } = require('pg');

const EXCEL_PATH = process.argv[2] || 'D:\\Users\\HI\\Downloads\\DCM-as-of-May-1.xlsx';
const OUTPUT_PATH = process.argv[3] || path.join(__dirname, '..', 'data', 'may1_loan_balance_report.json');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

loadEnv();

function parseExcelDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    return new Date(Math.round((value - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function normName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,]/g, '')
    .trim();
}

function asNumber(value) {
  const parsed = Number.parseFloat(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function detectSheet(workbook) {
  return workbook.Sheets['DATA of Clients'] ? 'DATA of Clients' : workbook.SheetNames[0];
}

function extractExcelLoans() {
  const workbook = xlsx.readFile(EXCEL_PATH, { cellDates: true, cellStyles: true });
  const sheetName = detectSheet(workbook);
  const ws = workbook.Sheets[sheetName];
  const range = xlsx.utils.decode_range(ws['!ref']);
  const ignore = ['batch', 'total', 'grand total', 'name of client', 'monthly', 'weekly'];
  const loans = [];
  let frequency = 'daily';
  let batchName = '';

  for (let r = 0; r <= range.e.r; r++) {
    const firstCell = ws[xlsx.utils.encode_cell({ r, c: 0 })];
    const firstValue = firstCell?.v == null ? '' : String(firstCell.v).trim();
    if (!firstValue) continue;

    const lowered = firstValue.toLowerCase();
    if (lowered.includes('batch')) {
      batchName = firstValue;
      const jValue = String(ws[xlsx.utils.encode_cell({ r, c: 9 })]?.v || '').toLowerCase();
      frequency = lowered.includes('weekly') || jValue.includes('weekly') ? 'weekly' : 'daily';
      continue;
    }
    if (ignore.some((keyword) => lowered.startsWith(keyword)) || lowered.length < 4) continue;

    const get = (c) => ws[xlsx.utils.encode_cell({ r, c })]?.v ?? null;
    const principal = asNumber(get(11));
    const totalLoan = asNumber(get(17));
    const balance = asNumber(get(18));
    if (principal <= 0 && totalLoan <= 0) continue;

    let isPaid = false;
    const fill = firstCell?.s?.fgColor;
    if (fill?.theme === 5 && fill.tint !== undefined && Math.abs(fill.tint - 0.6) < 0.1) {
      isPaid = true;
    }

    loans.push({
      row: r + 1,
      name: firstValue,
      name_key: normName(firstValue),
      collector: String(get(5) || '').trim(),
      frequency,
      batch: batchName,
      release_date: parseExcelDate(get(9)),
      maturity_date: parseExcelDate(get(10)),
      principal,
      total_loan: totalLoan,
      balance,
      status: isPaid || balance <= 1 ? 'paid' : 'active',
    });
  }

  return { sheetName, loans };
}

function createDbClient() {
  if (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL) {
    return new Client({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL });
  }
  return new Client({
    host: process.env.SUPABASE_DB_HOST || '127.0.0.1',
    port: Number(process.env.SUPABASE_DB_PORT || 55322),
    user: process.env.SUPABASE_DB_USER || 'postgres',
    password: process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD || 'postgres',
    database: process.env.SUPABASE_DB_NAME || 'postgres',
  });
}

async function fetchAppLoans() {
  const client = createDbClient();
  await client.connect();
  try {
    const { rows } = await client.query(`
      select
        l.id,
        l.loan_number,
        b.full_name as borrower_name,
        l.principal_amount,
        l.total_amount,
        l.status,
        l.release_date,
        l.maturity_date,
        l.frequency,
        coalesce(sum(p.amount) filter (where p.deleted_at is null), 0)::numeric as total_paid
      from app_loans l
      left join app_borrowers b on b.id::text = l.borrower_id::text and b.deleted_at is null
      left join app_payments p on p.loan_id::text = l.id::text
      where l.deleted_at is null
      group by l.id, b.full_name
      order by b.full_name, l.release_date
    `);

    return rows.map((loan) => {
      const totalPaid = roundMoney(asNumber(loan.total_paid));
      const totalAmount = asNumber(loan.total_amount);
      const releaseDate = loan.release_date instanceof Date
        ? loan.release_date.toISOString().slice(0, 10)
        : String(loan.release_date || '').slice(0, 10) || null;
      const maturityDate = loan.maturity_date instanceof Date
        ? loan.maturity_date.toISOString().slice(0, 10)
        : String(loan.maturity_date || '').slice(0, 10) || null;

      return {
        id: loan.id,
        loan_number: loan.loan_number,
        name: loan.borrower_name || 'Unknown',
        name_key: normName(loan.borrower_name),
        principal: asNumber(loan.principal_amount),
        total_loan: totalAmount,
        balance: roundMoney(totalAmount - totalPaid),
        total_paid: totalPaid,
        status: loan.status,
        release_date: releaseDate,
        maturity_date: maturityDate,
        frequency: loan.frequency || '',
      };
    });
  } finally {
    await client.end();
  }
}

function scoreMatch(excel, app) {
  let score = 0;
  if (excel.name_key === app.name_key) score += 100;
  if (Math.abs(excel.principal - app.principal) <= 1) score += 25;
  if (Math.abs(excel.total_loan - app.total_loan) <= 1) score += 20;
  if (excel.release_date && excel.release_date === app.release_date) score += 15;
  if (excel.status === app.status) score += 5;
  return score;
}

async function main() {
  const { sheetName, loans: excelLoans } = extractExcelLoans();
  const appLoans = await fetchAppLoans();
  const appByName = new Map();

  for (const loan of appLoans) {
    if (!appByName.has(loan.name_key)) appByName.set(loan.name_key, []);
    appByName.get(loan.name_key).push(loan);
  }

  const matches = [];
  const mismatches = [];
  const excelOnly = [];
  const matchedAppIds = new Set();

  for (const excel of excelLoans) {
    const candidates = appByName.get(excel.name_key) || [];
    let best = null;
    let bestScore = -1;
    for (const app of candidates) {
      const score = scoreMatch(excel, app);
      if (score > bestScore) {
        best = app;
        bestScore = score;
      }
    }

    if (!best || bestScore < 100) {
      excelOnly.push(excel);
      continue;
    }

    matchedAppIds.add(best.id);
    const balanceDiff = roundMoney(excel.balance - best.balance);
    const row = {
      row: excel.row,
      name: excel.name,
      app_loan_id: best.id,
      app_loan_number: best.loan_number,
      collector_excel: excel.collector,
      principal_excel: excel.principal,
      principal_app: best.principal,
      total_loan_excel: excel.total_loan,
      total_loan_app: best.total_loan,
      balance_excel: excel.balance,
      balance_app: best.balance,
      balance_diff: balanceDiff,
      total_paid_app: best.total_paid,
      status_excel: excel.status,
      status_app: best.status,
      release_date_excel: excel.release_date,
      release_date_app: best.release_date,
    };

    if (Math.abs(balanceDiff) <= 1) matches.push(row);
    else mismatches.push(row);
  }

  const appOnly = appLoans.filter((loan) => !matchedAppIds.has(loan.id));
  mismatches.sort((a, b) => Math.abs(b.balance_diff) - Math.abs(a.balance_diff));

  const excelTotalBalance = roundMoney(excelLoans.reduce((sum, loan) => sum + loan.balance, 0));
  const appMatchedTotalBalance = roundMoney([...matches, ...mismatches].reduce((sum, loan) => sum + loan.balance_app, 0));
  const report = {
    generated_at: new Date().toISOString(),
    excel_path: EXCEL_PATH,
    sheet_name: sheetName,
    summary: {
      excel_loans: excelLoans.length,
      app_loans: appLoans.length,
      matched_balance: matches.length,
      mismatched_balance: mismatches.length,
      excel_only: excelOnly.length,
      app_only: appOnly.length,
      excel_total_balance: excelTotalBalance,
      app_total_balance_for_matched_excel_loans: appMatchedTotalBalance,
      matched_balance_difference: roundMoney(excelTotalBalance - appMatchedTotalBalance),
    },
    mismatches,
    excel_only: excelOnly,
    app_only: appOnly,
    matches,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));

  console.log('May 1 loan balance verification complete');
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report: ${OUTPUT_PATH}`);
  if (mismatches.length) {
    console.log('\nTop balance mismatches:');
    for (const item of mismatches.slice(0, 20)) {
      console.log(`${item.row} ${item.name} | Excel ${item.balance_excel.toFixed(2)} | App ${item.balance_app.toFixed(2)} | Diff ${item.balance_diff.toFixed(2)}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
