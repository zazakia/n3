/**
 * verify-weekly-excel-vs-db.mjs
 *
 * Reads both WEEKLY-DCS-angelica.xlsx and WEEKLY-DCS-meshelle.xlsx,
 * extracts every borrower's loan amounts and payment totals,
 * then compares them 1-for-1 against the local Docker Supabase DB.
 *
 * Reports:
 *   - Total borrower/loan count match
 *   - Per-borrower balance discrepancies
 *   - Missing borrowers (in Excel but not in DB)
 *   - Extra records (in DB but not from weekly Excel source)
 *   - Payment total accuracy
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

// ── helpers ──────────────────────────────────────────────────────────────────
function excelDateToJSDate(serial) {
  if (!serial || isNaN(serial)) return null;
  const utc_days = Math.floor(serial - 25569);
  const date_info = new Date(utc_days * 86400 * 1000);
  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
}

function parseFloat2(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function splitName(fullName) {
  if (!fullName) return { first: '', last: '', full: '' };
  const cleanName = fullName.trim();
  if (cleanName.includes(',')) {
    const parts = cleanName.split(',').map(p => p.trim());
    return { last: parts[0] || '', first: parts[1] || '', full: `${parts[1] || ''} ${parts[0] || ''}`.trim() };
  }
  const parts = cleanName.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '', full: parts[0] };
  const last = parts.pop();
  return { first: parts.join(' '), last, full: cleanName };
}

const SKIP_ROW_RE = /^(Name Of Client|Total|Grand Total|Sub.?Total|\s*$)/i;
const MEETING_DAY_RE = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+Meeting$/i;

// ── parse Excel ───────────────────────────────────────────────────────────────
function parseWeeklyExcel() {
  const excelBorrowers = []; // { name, group, loanAmount, totalPortfolio, totalPayments, netLoan, installment }

  for (const filepath of FILES) {
    if (!fs.existsSync(filepath)) {
      console.warn(`⚠️  File not found: ${filepath}`);
      continue;
    }
    console.log(`\n📂 Reading: ${path.basename(filepath)}`);
    const workbook = xlsx.read(fs.readFileSync(filepath), { type: 'buffer' });
    const sheetNames = workbook.SheetNames;
    const weeklySheetName = sheetNames.find(name => name.toLowerCase().includes('weekly'));
    if (!weeklySheetName) { console.error('  No Weekly sheet found.'); continue; }

    const sheet = workbook.Sheets[weeklySheetName];
    const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const datesRow = rawData[1] || [];
    const subHeaderRow = rawData[2] || [];
    const rawGroup = rawData[2] ? rawData[2][0] : '';
    const groupName = String(rawGroup || '').trim() || 'Unknown Group';

    // Extract payment date columns
    let maxLength = 0;
    for (const r of rawData) { if (r && r.length > maxLength) maxLength = r.length; }

    const paymentDateMap = [];
    let lastKnownDate = null;
    for (let c = 25; c < maxLength; c++) {
      if (subHeaderRow[c] && String(subHeaderRow[c]).trim().toLowerCase() === 'prin') {
        let dateObj = null;
        const possibleDateCol = datesRow[c + 1] || datesRow[c];
        if (typeof possibleDateCol === 'number') {
          dateObj = excelDateToJSDate(possibleDateCol);
          lastKnownDate = dateObj;
        } else if (lastKnownDate) {
          dateObj = new Date(lastKnownDate.getTime() + 7 * 24 * 60 * 60 * 1000);
          lastKnownDate = dateObj;
        }
        if (dateObj) paymentDateMap.push({ colStart: c, date: dateObj });
      }
    }

    console.log(`  Group: ${groupName}, Payment columns: ${paymentDateMap.length}`);
    let rowCount = 0;

    for (let r = 4; r < rawData.length; r++) {
      const row = rawData[r];
      if (!row || row.length === 0) continue;

      const clientNameRaw = row[0]?.toString().trim();
      if (!clientNameRaw || SKIP_ROW_RE.test(clientNameRaw) || MEETING_DAY_RE.test(clientNameRaw)) continue;

      const loanAmount = parseFloat2(row[10]);
      if (loanAmount === 0) continue; // skip group/barangay header rows

      const { full: clientName } = splitName(clientNameRaw);
      const installmentAmount = parseFloat2(row[11]);
      const interestAmount = parseFloat2(row[16]); // total interest charged
      const totalPortfolio = loanAmount > 0 ? loanAmount + interestAmount : 0; // total repayable
      const netLoan = parseFloat2(row[15]);

      // Sum all weekly payments from payment date columns
      let totalPaid = 0;
      let principalPaid = 0;
      for (const map of paymentDateMap) {
        principalPaid += parseFloat2(row[map.colStart]); // col = principal paid this week
        totalPaid += parseFloat2(row[map.colStart + 3]); // col+3 = totalPaid column
      }

      // Outstanding balance from Excel perspective
      const outstandingBalance = Math.max(0, totalPortfolio - totalPaid);
      const status = (principalPaid >= totalPortfolio && totalPortfolio > 0) ? 'paid' : 'active';

      excelBorrowers.push({
        name: clientName,
        nameLower: clientName.toLowerCase(),
        group: groupName,
        loanAmount,
        totalPortfolio,
        netLoan,
        installmentAmount,
        principalPaid,
        totalPaid,
        outstandingBalance,
        status,
        sourceFile: path.basename(filepath),
      });
      rowCount++;
    }
    console.log(`  → ${rowCount} borrower rows parsed`);
  }

  return excelBorrowers;
}

// ── compare vs DB ─────────────────────────────────────────────────────────────
async function compareWithDB(excelBorrowers) {
  const client = new pg.Client({
    host: process.env.SUPABASE_DB_HOST || '127.0.0.1',
    port: Number(process.env.SUPABASE_DB_PORT || '55322'),
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    user: process.env.SUPABASE_DB_USER || 'postgres',
    password: process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD || 'postgres',
  });
  await client.connect();

  // Fetch all weekly loans from DB (LN-WKLY prefix)
  const { rows: dbLoans } = await client.query(`
    SELECT
      b.full_name,
      b."group",
      l.id as loan_id,
      l.loan_number,
      l.principal_amount::numeric as loan_amount,
      l.total_amount::numeric as total_portfolio,
      l.status,
      l.frequency,
      COALESCE(SUM(p.amount::numeric), 0) as total_paid
    FROM app_borrowers b
    JOIN app_loans l ON b.id::text = l.borrower_id::text
    LEFT JOIN app_payments p ON l.id::text = p.loan_id::text AND p.deleted_at IS NULL
    WHERE l.loan_number LIKE 'LN-WKLY-%'
      AND l.deleted_at IS NULL
      AND b.deleted_at IS NULL
    GROUP BY b.full_name, b."group", l.id, l.loan_number, l.principal_amount, l.total_amount, l.status, l.frequency
    ORDER BY b.full_name, l.loan_number
  `);

  // Build DB map by borrower name (lower)
  const dbMap = new Map();
  for (const row of dbLoans) {
    const key = row.full_name.toLowerCase();
    if (!dbMap.has(key)) dbMap.set(key, []);
    dbMap.get(key).push(row);
  }

  await client.end();
  return { dbLoans, dbMap };
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   WEEKLY EXCEL vs DB VERIFICATION                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // 1. Parse Excel
  console.log('\n📊 Step 1: Parsing Excel files...');
  const excelBorrowers = parseWeeklyExcel();
  console.log(`\n   Total Excel rows (real borrowers): ${excelBorrowers.length}`);
  console.log(`   Active: ${excelBorrowers.filter(b => b.status === 'active').length}`);
  console.log(`   Paid:   ${excelBorrowers.filter(b => b.status === 'paid').length}`);

  // 2. Fetch DB
  console.log('\n📊 Step 2: Fetching DB records (WKLY loans)...');
  const { dbLoans, dbMap } = await compareWithDB(excelBorrowers);
  console.log(`   Total DB weekly loan records: ${dbLoans.length}`);
  const dbActiveLoanCount = dbLoans.filter(l => l.status === 'active').length;
  const dbPaidLoanCount = dbLoans.filter(l => l.status === 'paid').length;
  console.log(`   Active: ${dbActiveLoanCount}`);
  console.log(`   Paid:   ${dbPaidLoanCount}`);

  // 3. Compare
  console.log('\n📊 Step 3: Comparing Excel vs DB...');
  const TOLERANCE = 1.0; // PHP 1 rounding tolerance

  let matched = 0;
  let mismatched = 0;
  let missingInDB = 0;
  const discrepancies = [];
  const missing = [];
  const excelNameSet = new Set(excelBorrowers.map(b => b.nameLower));

  // Check every Excel borrower against DB
  for (const eb of excelBorrowers) {
    const dbRows = dbMap.get(eb.nameLower);
    if (!dbRows || dbRows.length === 0) {
      missingInDB++;
      missing.push({ name: eb.name, group: eb.group, loanAmount: eb.loanAmount, status: eb.status });
      continue;
    }

    // Find best matching loan (by principal amount)
    const dbRow = dbRows.find(r => Math.abs(Number(r.loan_amount) - eb.loanAmount) < TOLERANCE)
      || dbRows[dbRows.length - 1]; // fallback to latest

    const dbBalance = Math.max(0, Number(dbRow.total_portfolio) - Number(dbRow.total_paid));
    const excelBalance = eb.outstandingBalance;

    const principalMatch = Math.abs(Number(dbRow.loan_amount) - eb.loanAmount) < TOLERANCE;
    const portfolioMatch = Math.abs(Number(dbRow.total_portfolio) - eb.totalPortfolio) < TOLERANCE;
    const balanceMatch = Math.abs(dbBalance - excelBalance) < TOLERANCE;
    const statusMatch = dbRow.status === eb.status;

    if (principalMatch && portfolioMatch && balanceMatch) {
      matched++;
    } else {
      mismatched++;
      discrepancies.push({
        name: eb.name,
        group: eb.group,
        loanNumber: dbRow.loan_number,
        excel: {
          loanAmount: eb.loanAmount,
          totalPortfolio: eb.totalPortfolio,
          totalPaid: eb.totalPaid,
          balance: excelBalance,
          status: eb.status,
        },
        db: {
          loanAmount: Number(dbRow.loan_amount),
          totalPortfolio: Number(dbRow.total_portfolio),
          totalPaid: Number(dbRow.total_paid),
          balance: dbBalance,
          status: dbRow.status,
        },
        issues: [
          !principalMatch ? `Principal: Excel ₱${eb.loanAmount} vs DB ₱${Number(dbRow.loan_amount)}` : null,
          !portfolioMatch ? `Portfolio: Excel ₱${eb.totalPortfolio} vs DB ₱${Number(dbRow.total_portfolio)}` : null,
          !balanceMatch ? `Balance: Excel ₱${excelBalance.toFixed(2)} vs DB ₱${dbBalance.toFixed(2)}` : null,
          !statusMatch ? `Status: Excel '${eb.status}' vs DB '${dbRow.status}'` : null,
        ].filter(Boolean),
      });
    }
  }

  // Check for DB records not in Excel (extras)
  const extras = dbLoans.filter(r => !excelNameSet.has(r.full_name.toLowerCase()));

  // 4. Results
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

  // Report discrepancies
  if (discrepancies.length > 0) {
    console.log(`\n❌ BALANCE DISCREPANCIES (${discrepancies.length}):`);
    discrepancies.forEach((d, i) => {
      console.log(`\n  ${i + 1}. ${d.name} [${d.group}] — ${d.loanNumber}`);
      d.issues.forEach(issue => console.log(`     ⚠️  ${issue}`));
      console.log(`     Excel: principal=₱${d.excel.loanAmount}, portfolio=₱${d.excel.totalPortfolio}, paid=₱${d.excel.totalPaid.toFixed(2)}, balance=₱${d.excel.balance.toFixed(2)}, status=${d.excel.status}`);
      console.log(`     DB:    principal=₱${d.db.loanAmount}, portfolio=₱${d.db.totalPortfolio}, paid=₱${d.db.totalPaid.toFixed(2)}, balance=₱${d.db.balance.toFixed(2)}, status=${d.db.status}`);
    });
  } else {
    console.log('\n✅ No balance discrepancies found!');
  }

  if (missing.length > 0) {
    console.log(`\n⚠️  MISSING IN DB (${missing.length}):`);
    missing.slice(0, 20).forEach(m => {
      console.log(`  - ${m.name} [${m.group}] — ₱${m.loanAmount} (${m.status})`);
    });
    if (missing.length > 20) console.log(`  ... and ${missing.length - 20} more`);
  } else {
    console.log('\n✅ All Excel borrowers found in DB!');
  }

  if (extras.length > 0) {
    console.log(`\n🔍 EXTRA WEEKLY RECORDS IN DB NOT IN EXCEL (${extras.length}):`);
    extras.slice(0, 10).forEach(e => {
      console.log(`  - ${e.full_name} [${e.group}] — ${e.loan_number} ₱${e.loan_amount} (${e.status})`);
    });
    if (extras.length > 10) console.log(`  ... and ${extras.length - 10} more`);
  } else {
    console.log('\n✅ No extra weekly records in DB!');
  }

  // Summary totals
  const excelTotalPrincipal = excelBorrowers.reduce((s, b) => s + b.loanAmount, 0);
  const excelTotalPortfolio = excelBorrowers.reduce((s, b) => s + b.totalPortfolio, 0);
  const excelTotalPaid = excelBorrowers.reduce((s, b) => s + b.totalPaid, 0);
  const excelTotalBalance = excelBorrowers.reduce((s, b) => s + b.outstandingBalance, 0);

  const dbTotalPrincipal = dbLoans.reduce((s, r) => s + Number(r.loan_amount), 0);
  const dbTotalPortfolio = dbLoans.reduce((s, r) => s + Number(r.total_portfolio), 0);
  const dbTotalPaid = dbLoans.reduce((s, r) => s + Number(r.total_paid), 0);
  const dbTotalBalance = dbLoans.reduce((s, r) => s + Math.max(0, Number(r.total_portfolio) - Number(r.total_paid)), 0);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    FINANCIAL TOTALS                         ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║                         Excel              DB               ║`);
  console.log(`║  Total Principal:  ₱${String(excelTotalPrincipal.toLocaleString()).padEnd(14)} ₱${String(dbTotalPrincipal.toLocaleString()).padEnd(16)}║`);
  console.log(`║  Total Portfolio:  ₱${String(excelTotalPortfolio.toLocaleString()).padEnd(14)} ₱${String(dbTotalPortfolio.toLocaleString()).padEnd(16)}║`);
  console.log(`║  Total Paid:       ₱${String(excelTotalPaid.toLocaleString()).padEnd(14)} ₱${String(dbTotalPaid.toLocaleString()).padEnd(16)}║`);
  console.log(`║  Outstanding Bal:  ₱${String(excelTotalBalance.toLocaleString()).padEnd(14)} ₱${String(dbTotalBalance.toLocaleString()).padEnd(16)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const principalDiff = Math.abs(excelTotalPrincipal - dbTotalPrincipal);
  const portfolioDiff = Math.abs(excelTotalPortfolio - dbTotalPortfolio);
  const paidDiff = Math.abs(excelTotalPaid - dbTotalPaid);
  const balanceDiff = Math.abs(excelTotalBalance - dbTotalBalance);

  console.log('\n📊 GRAND TOTAL DIFFERENCES:');
  console.log(`  Principal diff:  ₱${principalDiff.toFixed(2)} ${principalDiff < 10 ? '✅' : '❌'}`);
  console.log(`  Portfolio diff:  ₱${portfolioDiff.toFixed(2)} ${portfolioDiff < 10 ? '✅' : '❌'}`);
  console.log(`  Paid diff:       ₱${paidDiff.toFixed(2)} ${paidDiff < 10 ? '✅' : '❌'}`);
  console.log(`  Balance diff:    ₱${balanceDiff.toFixed(2)} ${balanceDiff < 10 ? '✅' : '❌'}`);

  const overallOK = mismatched === 0 && missingInDB === 0 && discrepancies.length === 0;
  console.log('\n' + (overallOK
    ? '🎉 OVERALL: ALL WEEKLY DATA MATCHES — Excel ≡ DB ✅'
    : `⚠️  OVERALL: ${mismatched + missingInDB} issue(s) found — review above`));

  // Write JSON report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      excelBorrowerCount: excelBorrowers.length,
      dbWeeklyLoanCount: dbLoans.length,
      matched,
      mismatched,
      missingInDB,
      extraInDB: extras.length,
      overallOK,
    },
    financialTotals: {
      excel: { totalPrincipal: excelTotalPrincipal, totalPortfolio: excelTotalPortfolio, totalPaid: excelTotalPaid, totalBalance: excelTotalBalance },
      db: { totalPrincipal: dbTotalPrincipal, totalPortfolio: dbTotalPortfolio, totalPaid: dbTotalPaid, totalBalance: dbTotalBalance },
    },
    discrepancies,
    missing,
    extras: extras.map(e => ({ name: e.full_name, group: e.group, loanNumber: e.loan_number, amount: Number(e.loan_amount), status: e.status })),
  };
  fs.writeFileSync('scripts/weekly-verification-report.json', JSON.stringify(report, null, 2));
  console.log('\n📄 Full report saved to: scripts/weekly-verification-report.json');
}

main().catch(err => { console.error('\n💥 Fatal:', err.message); process.exit(1); });
