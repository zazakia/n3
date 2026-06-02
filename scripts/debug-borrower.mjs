/**
 * debug-specific-borrower.mjs — inspect a specific borrower in both Excel and DB
 */

import xlsx from 'xlsx';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGETS = ['Resie R. Alkuino', 'Rosalinda R. Navarro', 'Esterlita N. Concillo'];
const FILES = [
  path.resolve(__dirname, '..', 'files (1)', 'WEEKLY-DCS-angelica.xlsx'),
  path.resolve(__dirname, '..', 'files (1)', 'WEEKLY-DCS-meshelle.xlsx'),
];

for (const filepath of FILES) {
  const workbook = xlsx.read(fs.readFileSync(filepath), { type: 'buffer' });
  const sheetNames = workbook.SheetNames;
  const weeklySheetName = sheetNames.find(name => name.toLowerCase().includes('weekly'));
  const sheet = workbook.Sheets[weeklySheetName];
  const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  for (let r = 4; r < rawData.length; r++) {
    const row = rawData[r];
    if (!row || !row[0]) continue;
    const name = row[0].toString().trim();
    if (!TARGETS.includes(name)) continue;

    console.log(`\n=== ${name} (${path.basename(filepath)}, row ${r}) ===`);
    // col labels from row 3
    const labels = {
      0: 'Name', 10: 'LoanAmount', 11: 'Weekly(installment)',
      12: 'Saving', 13: 'Insurance', 14: 'TotalLoanPayments(1wk)',
      15: 'NetLoan', 16: 'Interest', 17: 'TotalLoanPortfolio', 18: 'Prin.',
      19: 'TotalSavings', 20: 'TotalInsurance', 21: 'Prin+Insurance',
      23: 'TotalPayments(col23)', 24: 'Prin+Savings+Ins',
    };
    for (const [c, label] of Object.entries(labels)) {
      const v = row[Number(c)];
      if (v !== null && v !== undefined && v !== '') {
        console.log(`  col[${c}] ${label} = ${v}`);
      }
    }
    // Payment columns
    const subHeaderRow = rawData[2] || [];
    let maxLen = 0;
    for (const ro of rawData) { if (ro && ro.length > maxLen) maxLen = ro.length; }
    let weekNum = 1;
    for (let c = 25; c < Math.min(maxLen, 120); c++) {
      const subH = subHeaderRow[c];
      if (subH && String(subH).trim().toLowerCase() === 'prin') {
        const prin = row[c] || 0;
        const dep = row[c+1] || 0;
        const ins = row[c+2] || 0;
        const tot = row[c+3] || 0;
        if (prin || dep || ins || tot) {
          console.log(`  Week ${weekNum}: prin=${prin} dep=${dep} ins=${ins} total=${tot} (cols ${c}-${c+3})`);
        }
        weekNum++;
      }
    }
    // Summary
    const loanAmt = parseFloat(row[10]) || 0;
    const port = parseFloat(row[17]) || 0;
    const installment = parseFloat(row[11]) || 0;
    const term = parseInt(row[6]) || 24;
    console.log(`\n  SUMMARY: principal=₱${loanAmt}, portfolio(col17)=₱${port}, installment=₱${installment}/wk, term=${term}wks`);
    console.log(`  Expected portfolio (installment*term): ₱${installment * term}`);
  }
}

// Now check DB
const client = new pg.Client({
  host: process.env.SUPABASE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SUPABASE_DB_PORT || '55322'),
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER || 'postgres',
  password: process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD || 'postgres',
});
await client.connect();
for (const name of TARGETS) {
  const { rows } = await client.query(`
    SELECT b.full_name, l.loan_number, l.principal_amount, l.total_amount, l.installment_amount, l.term, l.status,
           COALESCE(SUM(p.amount::numeric), 0) as total_paid, COUNT(p.id) as pay_count
    FROM app_borrowers b JOIN app_loans l ON b.id::text=l.borrower_id::text
    LEFT JOIN app_payments p ON l.id::text=p.loan_id::text AND p.deleted_at IS NULL
    WHERE b.full_name = $1 AND l.deleted_at IS NULL
    GROUP BY b.full_name, l.loan_number, l.principal_amount, l.total_amount, l.installment_amount, l.term, l.status
  `, [name]);
  if (rows.length) {
    const r = rows[0];
    const balance = Number(r.total_amount) - Number(r.total_paid);
    console.log(`\n[DB] ${r.full_name}: ${r.loan_number} principal=₱${r.principal_amount} total_amount=₱${r.total_amount} paid=₱${r.total_paid} balance=₱${balance} status=${r.status} payments=${r.pay_count}`);
  }
}
await client.end();
