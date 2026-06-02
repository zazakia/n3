/**
 * verify-weekly-excel-vs-db-v2.mjs
 * Corrected verification: uses principal+interest as total_amount and principal-only payments
 */

import xlsx from 'xlsx';
import pg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FILES = [
  path.resolve(__dirname, '..', 'files (1)', 'WEEKLY-DCS-angelica.xlsx'),
  path.resolve(__dirname, '..', 'files (1)', 'WEEKLY-DCS-meshelle.xlsx'),
];

function parseFloat2(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

function splitName(fullName) {
  if (!fullName) return { full: '' };
  const cleanName = fullName.trim();
  return { full: cleanName };
}

const SKIP_ROW_RE = /^(Name Of Client|Total|Grand Total|Sub.?Total|\s*$)/i;
const MEETING_DAY_RE = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+Meeting$/i;

function parseWeeklyExcel() {
  const excelBorrowers = [];

  for (const filepath of FILES) {
    if (!fs.existsSync(filepath)) { console.warn(`⚠️  Not found: ${filepath}`); continue; }
    const workbook = xlsx.read(fs.readFileSync(filepath), { type: 'buffer' });
    const sheetNames = workbook.SheetNames;
    const weeklySheetName = sheetNames.find(name => name.toLowerCase().includes('weekly'));
    if (!weeklySheetName) continue;

    const sheet = workbook.Sheets[weeklySheetName];
    const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    const subHeaderRow = rawData[2] || [];

    let maxLength = 0;
    for (const r of rawData) { if (r && r.length > maxLength) maxLength = r.length; }

    const paymentDateMap = [];
    for (let c = 25; c < maxLength; c++) {
      if (subHeaderRow[c] && String(subHeaderRow[c]).trim().toLowerCase() === 'prin') {
        paymentDateMap.push({ colStart: c });
      }
    }

    for (let r = 4; r < rawData.length; r++) {
      const row = rawData[r];
      if (!row || row.length === 0) continue;
      const clientNameRaw = row[0]?.toString().trim();
      if (!clientNameRaw || SKIP_ROW_RE.test(clientNameRaw) || MEETING_DAY_RE.test(clientNameRaw)) continue;

      const loanAmount = parseFloat2(row[10]);
      if (loanAmount === 0) continue;

      const { full: clientName } = splitName(clientNameRaw);
      const installmentAmount = parseFloat2(row[11]);
      const interestAmount = parseFloat2(row[16]);
      // Correct total_amount = principal + interest (same as in migrate-weekly.js after fix)
      const totalAmount = loanAmount > 0 ? (loanAmount + interestAmount) : 0;

      // Sum principal payments only (colStart = Prin column)
      let principalPaid = 0;
      for (const map of paymentDateMap) {
        principalPaid += parseFloat2(row[map.colStart]);
      }

      const outstandingBalance = Math.max(0, totalAmount - principalPaid);
      const status = (principalPaid >= totalAmount && totalAmount > 0) ? 'paid' : 'active';

      excelBorrowers.push({
        name: clientName,
        nameLower: clientName.toLowerCase(),
        loanAmount,
        totalAmount,
        interestAmount,
        installmentAmount,
        principalPaid,
        outstandingBalance,
        status,
        sourceFile: path.basename(filepath),
      });
    }
  }
  return excelBorrowers;
}

async function compareWithDB(excelBorrowers) {
  const client = new pg.Client({
    host: process.env.SUPABASE_DB_HOST || '127.0.0.1',
    port: Number(process.env.SUPABASE_DB_PORT || '55322'),
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    user: process.env.SUPABASE_DB_USER || 'postgres',
    password: process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD || 'postgres',
  });
  await client.connect();

  const { rows: dbLoans } = await client.query(`
    SELECT b.full_name, l.id as loan_id, l.loan_number,
           l.principal_amount::numeric as loan_amount,
           l.total_amount::numeric as total_amount,
           l.status,
           COALESCE(SUM(p.amount::numeric), 0) as total_paid
    FROM app_borrowers b
    JOIN app_loans l ON b.id::text = l.borrower_id::text
    LEFT JOIN app_payments p ON l.id::text = p.loan_id::text AND p.deleted_at IS NULL
    WHERE l.loan_number LIKE 'LN-WKLY-%' AND l.deleted_at IS NULL AND b.deleted_at IS NULL
    GROUP BY b.full_name, l.id, l.loan_number, l.principal_amount, l.total_amount, l.status
    ORDER BY b.full_name, l.loan_number
  `);

  const dbMap = new Map();
  for (const row of dbLoans) {
    const key = row.full_name.toLowerCase();
    if (!dbMap.has(key)) dbMap.set(key, []);
    dbMap.get(key).push(row);
  }

  await client.end();
  return { dbLoans, dbMap };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   WEEKLY EXCEL vs DB VERIFICATION v2 (Fixed Column Logic)  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const excelBorrowers = parseWeeklyExcel();
  console.log(`\nExcel: ${excelBorrowers.length} borrowers (active=${excelBorrowers.filter(b=>b.status==='active').length}, paid=${excelBorrowers.filter(b=>b.status==='paid').length})`);

  const { dbLoans, dbMap } = await compareWithDB(excelBorrowers);
  console.log(`DB: ${dbLoans.length} weekly loan records (active=${dbLoans.filter(l=>l.status==='active').length}, paid=${dbLoans.filter(l=>l.status==='paid').length})`);

  const TOLERANCE = 1.0;
  let matched = 0, mismatched = 0, missingInDB = 0;
  const discrepancies = [], missing = [];
  const excelNameSet = new Set(excelBorrowers.map(b => b.nameLower));

  for (const eb of excelBorrowers) {
    const dbRows = dbMap.get(eb.nameLower);
    if (!dbRows || dbRows.length === 0) {
      missingInDB++;
      missing.push({ name: eb.name, loanAmount: eb.loanAmount, totalAmount: eb.totalAmount });
      continue;
    }
    const dbRow = dbRows.find(r => Math.abs(Number(r.loan_amount) - eb.loanAmount) < TOLERANCE) || dbRows[0];
    const dbBalance = Math.max(0, Number(dbRow.total_amount) - Number(dbRow.total_paid));
    const excelBalance = eb.outstandingBalance;

    const principalMatch = Math.abs(Number(dbRow.loan_amount) - eb.loanAmount) < TOLERANCE;
    const totalMatch = Math.abs(Number(dbRow.total_amount) - eb.totalAmount) < TOLERANCE;
    const paidMatch = Math.abs(Number(dbRow.total_paid) - eb.principalPaid) < TOLERANCE;
    const balanceMatch = Math.abs(dbBalance - excelBalance) < TOLERANCE;

    if (principalMatch && totalMatch && paidMatch && balanceMatch) {
      matched++;
    } else {
      mismatched++;
      discrepancies.push({
        name: eb.name,
        loanNumber: dbRow.loan_number,
        issues: [
          !principalMatch ? `Principal: Excel ₱${eb.loanAmount} vs DB ₱${Number(dbRow.loan_amount)}` : null,
          !totalMatch ? `Total Amount: Excel ₱${eb.totalAmount} vs DB ₱${Number(dbRow.total_amount)}` : null,
          !paidMatch ? `Paid: Excel ₱${eb.principalPaid.toFixed(0)} vs DB ₱${Number(dbRow.total_paid).toFixed(0)}` : null,
          !balanceMatch ? `Balance: Excel ₱${excelBalance.toFixed(2)} vs DB ₱${dbBalance.toFixed(2)}` : null,
        ].filter(Boolean),
      });
    }
  }

  const extras = dbLoans.filter(r => !excelNameSet.has(r.full_name.toLowerCase()));

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    VERIFICATION RESULTS                     ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Excel borrowers:     ${String(excelBorrowers.length).padEnd(38)}║`);
  console.log(`║  DB weekly loans:     ${String(dbLoans.length).padEnd(38)}║`);
  console.log(`║  ✅ Matched:          ${String(matched).padEnd(38)}║`);
  console.log(`║  ❌ Mismatched:       ${String(mismatched).padEnd(38)}║`);
  console.log(`║  ⚠️  Missing in DB:    ${String(missingInDB).padEnd(38)}║`);
  console.log(`║  🔍 Extra in DB:      ${String(extras.length).padEnd(38)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  if (discrepancies.length > 0) {
    console.log(`\n❌ DISCREPANCIES (first 20 of ${discrepancies.length}):`);
    discrepancies.slice(0, 20).forEach((d, i) => {
      console.log(`  ${i+1}. ${d.name} [${d.loanNumber}]: ${d.issues.join(' | ')}`);
    });
  } else {
    console.log('\n✅ No discrepancies found!');
  }

  if (missing.length > 0) {
    console.log(`\n⚠️  Missing in DB: ${missing.slice(0,10).map(m=>m.name).join(', ')}`);
  } else {
    console.log('\n✅ All Excel borrowers found in DB!');
  }

  // Financial totals
  const excelTotalPrincipal = excelBorrowers.reduce((s, b) => s + b.loanAmount, 0);
  const excelTotalAmount = excelBorrowers.reduce((s, b) => s + b.totalAmount, 0);
  const excelTotalPaid = excelBorrowers.reduce((s, b) => s + b.principalPaid, 0);
  const excelTotalBalance = excelBorrowers.reduce((s, b) => s + b.outstandingBalance, 0);

  const dbTotalPrincipal = dbLoans.reduce((s, r) => s + Number(r.loan_amount), 0);
  const dbTotalAmount = dbLoans.reduce((s, r) => s + Number(r.total_amount), 0);
  const dbTotalPaid = dbLoans.reduce((s, r) => s + Number(r.total_paid), 0);
  const dbTotalBalance = dbLoans.reduce((s, r) => s + Math.max(0, Number(r.total_amount) - Number(r.total_paid)), 0);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                 FINANCIAL TOTALS (Principals)               ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║                      Excel              DB                  ║`);
  console.log(`║  Principal:     ₱${String(excelTotalPrincipal.toLocaleString()).padEnd(12)} ₱${String(dbTotalPrincipal.toLocaleString()).padEnd(18)}║`);
  console.log(`║  Total Amount:  ₱${String(excelTotalAmount.toLocaleString()).padEnd(12)} ₱${String(dbTotalAmount.toLocaleString()).padEnd(18)}║`);
  console.log(`║  Total Paid:    ₱${String(excelTotalPaid.toLocaleString()).padEnd(12)} ₱${String(dbTotalPaid.toLocaleString()).padEnd(18)}║`);
  console.log(`║  Outstanding:   ₱${String(excelTotalBalance.toLocaleString()).padEnd(12)} ₱${String(dbTotalBalance.toLocaleString()).padEnd(18)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const diffs = {
    principal: Math.abs(excelTotalPrincipal - dbTotalPrincipal),
    total: Math.abs(excelTotalAmount - dbTotalAmount),
    paid: Math.abs(excelTotalPaid - dbTotalPaid),
    balance: Math.abs(excelTotalBalance - dbTotalBalance),
  };

  console.log('\nDIFFERENCES:');
  Object.entries(diffs).forEach(([k, v]) => {
    console.log(`  ${k.padEnd(12)}: ₱${v.toFixed(2)} ${v < 1 ? '✅' : '❌'}`);
  });

  const overallOK = matched === excelBorrowers.length && mismatched === 0 && missingInDB === 0 && extras.length === 0;
  console.log('\n' + (overallOK
    ? '🎉 ALL WEEKLY DATA PERFECTLY MATCHES EXCEL ≡ DB ✅'
    : `⚠️  ISSUES FOUND: ${mismatched} mismatched, ${missingInDB} missing, ${extras.length} extra`));

  // Save report
  fs.writeFileSync('scripts/weekly-verification-report-v2.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { excelCount: excelBorrowers.length, dbCount: dbLoans.length, matched, mismatched, missingInDB, extraInDB: extras.length, overallOK },
    financialTotals: { excel: { principal: excelTotalPrincipal, total: excelTotalAmount, paid: excelTotalPaid, balance: excelTotalBalance }, db: { principal: dbTotalPrincipal, total: dbTotalAmount, paid: dbTotalPaid, balance: dbTotalBalance } },
    discrepancies: discrepancies.slice(0, 50),
    missing,
    extras: extras.slice(0, 20).map(e => ({ name: e.full_name, loanNumber: e.loan_number, amount: Number(e.loan_amount) })),
  }, null, 2));
  console.log('\n📄 Report saved to: scripts/weekly-verification-report-v2.json');
}
main().catch(err => { console.error('💥', err.message); process.exit(1); });
