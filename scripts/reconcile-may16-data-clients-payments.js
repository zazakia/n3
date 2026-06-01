#!/usr/bin/env node

/**
 * Dry-run-first reconciliation for DCM-as-of-May-16.xlsx DATA of Clients.
 *
 * Compares Excel "Total Loan Balance" with app-computed balance:
 *   app_loans.total_amount - sum(non-deleted app_payments.amount)
 *
 * Default mode writes a report only. Use --execute to insert exact missing
 * Excel payment cells through column CE when they fully explain a balance gap.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');
const { Client } = require('pg');

const DEFAULT_EXCEL_PATH = 'E:\\Users\\HI\\Downloads\\DCM-as-of-May-16.xlsx';
const SHEET_NAME = 'DATA of Clients';
const PAYMENT_START_COL = XLSX.utils.decode_col('T');
const PAYMENT_END_COL = XLSX.utils.decode_col('CE');
const EPSILON = 0.01;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const idx = line.indexOf('=');
        const key = line.slice(0, idx).trim();
        let value = line.slice(idx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        return [key, value];
      }),
  );
}

function loadEnv() {
  return {
    ...loadEnvFile(path.join(__dirname, '..', '.env')),
    ...loadEnvFile(path.join(__dirname, '..', '.env.development')),
    ...loadEnvFile(path.join(__dirname, '..', '.env.local')),
    ...process.env,
  };
}

function parseArgs(argv) {
  const args = {
    excelPath: DEFAULT_EXCEL_PATH,
    outputDir: path.join('data', 'reconciliation'),
    execute: false,
    allowLocal: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--excel') args.excelPath = argv[++i];
    else if (arg === '--output-dir') args.outputDir = argv[++i];
    else if (arg === '--execute') args.execute = true;
    else if (arg === '--allow-local') args.allowLocal = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/reconcile-may16-data-clients-payments.js [--excel <path>] [--output-dir <dir>] [--execute] [--allow-local]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function makeClient(env, args) {
  const connectionString = env.DIRECT_URL || env.SUPABASE_DB_URL || env.DATABASE_URL;
  if (!connectionString) throw new Error('Missing DIRECT_URL, SUPABASE_DB_URL, or DATABASE_URL.');

  const looksLocal = /localhost|127\.0\.0\.1/i.test(connectionString);
  if (args.execute && looksLocal && !args.allowLocal) {
    throw new Error('Execution target looks local. Pass --allow-local only if local execution is intended.');
  }

  if (args.execute && !/supabase\.com|pooler\.supabase\.com/i.test(connectionString) && !args.allowLocal) {
    throw new Error('Execution requires a production-looking Supabase connection string or --allow-local.');
  }

  return new Client({ connectionString });
}

function clean(value) {
  return String(value ?? '').trim();
}

function normName(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function money(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value).replace(/[,\s₱]/g, '').replace(/^\((.*)\)$/, '-$1');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function parseExcelDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)).toISOString().slice(0, 10);
  }
  const text = clean(value);
  const mdY = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (mdY) {
    const month = Number(mdY[1]);
    const day = Number(mdY[2]);
    const rawYear = Number(mdY[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
    }
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function nextBusinessDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (date.getUTCDay() === 0);
  return date.toISOString().slice(0, 10);
}

function cellValue(ws, rowIndex, colIndex) {
  return ws[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })]?.v ?? '';
}

function isIgnoredName(name) {
  const lowered = normName(name);
  return !lowered
    || lowered.startsWith('name of client')
    || lowered.startsWith('batch')
    || lowered === 'total'
    || lowered === 'grand total'
    || lowered === 'monthly'
    || lowered === 'weekly';
}

function extractExcelLoans(excelPath) {
  if (!fs.existsSync(excelPath)) throw new Error(`Excel workbook not found: ${excelPath}`);

  const workbook = XLSX.readFile(excelPath, { cellDates: true, cellStyles: true });
  const ws = workbook.Sheets[SHEET_NAME];
  if (!ws) throw new Error(`Workbook is missing sheet "${SHEET_NAME}".`);

  const range = XLSX.utils.decode_range(ws['!ref']);
  const loans = [];
  let batchTitle = '';
  let frequency = 'daily';
  let paymentDates = new Map();

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const first = clean(cellValue(ws, r, 0));
    const lowered = first.toLowerCase();

    if (lowered.includes('batch')) {
      batchTitle = first;
      const rowText = Array.from({ length: Math.min(range.e.c + 1, 30) }, (_, c) => clean(cellValue(ws, r, c)).toLowerCase()).join(' ');
      frequency = rowText.includes('weekly') ? 'weekly' : 'daily';
      continue;
    }

    const rowValues = Array.from({ length: Math.min(range.e.c + 1, PAYMENT_END_COL + 1) }, (_, c) => cellValue(ws, r, c));
    if (rowValues.some((value) => /name of client/i.test(clean(value)))) {
      paymentDates = new Map();
      let previousDate = null;
      for (let c = PAYMENT_START_COL; c <= PAYMENT_END_COL; c += 1) {
        let date = parseExcelDate(cellValue(ws, r, c));
        if (!date && previousDate) date = nextBusinessDate(previousDate);
        if (date) {
          paymentDates.set(c, date);
          previousDate = date;
        }
      }
      continue;
    }

    if (isIgnoredName(first)) continue;

    const principal = money(cellValue(ws, r, 11));
    const totalLoan = money(cellValue(ws, r, 17));
    const excelBalance = money(cellValue(ws, r, 18));
    if (principal <= 0 && totalLoan <= 0 && excelBalance <= 0) continue;

    const payments = [];
    for (let c = PAYMENT_START_COL; c <= PAYMENT_END_COL; c += 1) {
      const amount = money(cellValue(ws, r, c));
      if (amount <= 0) continue;
      payments.push({
        row: r + 1,
        colIndex: c,
        col: XLSX.utils.encode_col(c),
        date: paymentDates.get(c) || null,
        amount: roundMoney(amount),
      });
    }

    loans.push({
      row: r + 1,
      name: first,
      nameKey: normName(first),
      collector: clean(cellValue(ws, r, 5)),
      batchTitle,
      batch: money(cellValue(ws, r, 7)),
      cycle: money(cellValue(ws, r, 8)),
      frequency,
      releaseDate: parseExcelDate(cellValue(ws, r, 9)),
      maturityDate: parseExcelDate(cellValue(ws, r, 10)),
      principal,
      totalLoan,
      excelBalance,
      payments,
    });
  }

  return { workbookSheets: workbook.SheetNames, loans };
}

async function fetchAppData(client) {
  const { rows: loans } = await client.query(`
    select
      l.id,
      l.loan_number,
      l.borrower_id,
      b.full_name as borrower_name,
      l.collector_id,
      c.full_name as collector_name,
      l.principal_amount,
      l.total_amount,
      l.installment_amount,
      l.release_date,
      l.maturity_date,
      l.frequency,
      l.batch,
      l.cycle,
      l.status,
      coalesce(sum(p.amount) filter (where p.deleted_at is null), 0)::numeric as total_paid
    from app_loans l
    left join app_borrowers b on b.id::text = l.borrower_id::text and b.deleted_at is null
    left join app_collectors c on c.id::text = l.collector_id::text and c.deleted_at is null
    left join app_payments p on p.loan_id::text = l.id::text
    where l.deleted_at is null
    group by l.id, b.full_name, c.full_name
    order by b.full_name, l.release_date nulls last, l.id
  `);

  const { rows: payments } = await client.query(`
    select id, loan_id, amount, payment_date
    from app_payments
    where deleted_at is null
  `);

  const appLoans = loans.map((loan) => {
    const totalAmount = money(loan.total_amount);
    const totalPaid = money(loan.total_paid);
    return {
      id: loan.id,
      loanNumber: loan.loan_number,
      borrowerId: loan.borrower_id,
      borrowerName: loan.borrower_name || '',
      nameKey: normName(loan.borrower_name),
      collectorId: loan.collector_id,
      collectorName: loan.collector_name || '',
      principal: money(loan.principal_amount),
      totalLoan: totalAmount,
      installmentAmount: money(loan.installment_amount),
      totalPaid,
      appBalance: roundMoney(totalAmount - totalPaid),
      releaseDate: parseDbDate(loan.release_date),
      maturityDate: parseDbDate(loan.maturity_date),
      frequency: clean(loan.frequency),
      batch: money(loan.batch),
      cycle: money(loan.cycle),
      status: clean(loan.status),
    };
  });

  const existingPayments = new Set(payments.map((payment) => (
    `${payment.loan_id}|${parseDbDate(payment.payment_date)}|${roundMoney(money(payment.amount)).toFixed(2)}`
  )));

  return { appLoans, existingPayments };
}

function parseDbDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return text.slice(0, 10);
}

function scoreLoan(excel, app) {
  if (excel.nameKey !== app.nameKey) return -1000;
  let score = 100;
  if (app.loanNumber && new RegExp(`R0*${excel.row}$`, 'i').test(app.loanNumber)) score += 80;
  if (Math.abs(excel.principal - app.principal) <= EPSILON) score += 40;
  if (Math.abs(excel.totalLoan - app.totalLoan) <= EPSILON) score += 35;
  if (excel.releaseDate && excel.releaseDate === app.releaseDate) score += 25;
  if (excel.maturityDate && excel.maturityDate === app.maturityDate) score += 10;
  if (excel.batch && app.batch && Math.abs(excel.batch - app.batch) <= EPSILON) score += 8;
  if (excel.cycle && app.cycle && Math.abs(excel.cycle - app.cycle) <= EPSILON) score += 8;
  if (excel.frequency && app.frequency && excel.frequency === app.frequency) score += 5;
  return score;
}

function chooseMatch(excel, appByName, usedAppIds) {
  const candidates = (appByName.get(excel.nameKey) || [])
    .filter((app) => !usedAppIds.has(app.id))
    .map((app) => ({ app, score: scoreLoan(excel, app) }))
    .filter((candidate) => candidate.score >= 100)
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) return { match: null, ambiguous: false, candidates: [] };
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
    return { match: null, ambiguous: true, candidates: candidates.slice(0, 5) };
  }
  return { match: candidates[0].app, ambiguous: false, candidates: candidates.slice(0, 5) };
}

function subsetEqual(items, target) {
  const centsTarget = Math.round(target * 100);
  if (centsTarget <= 0) return [];

  const dp = new Map([[0, []]]);
  for (const item of items) {
    const cents = Math.round(item.amount * 100);
    const entries = Array.from(dp.entries());
    for (const [sum, subset] of entries) {
      const next = sum + cents;
      if (next > centsTarget || dp.has(next)) continue;
      const nextSubset = [...subset, item];
      if (next === centsTarget) return nextSubset;
      dp.set(next, nextSubset);
    }
  }
  return null;
}

function buildReconciliation(excelLoans, appLoans, existingPayments) {
  const appByName = new Map();
  for (const app of appLoans) {
    if (!appByName.has(app.nameKey)) appByName.set(app.nameKey, []);
    appByName.get(app.nameKey).push(app);
  }

  const matched = [];
  const unmatchedExcel = [];
  const ambiguousMatches = [];
  const proposedPayments = [];
  const unsafeOverpay = [];
  const unresolvedMismatches = [];
  const matchedAppIds = new Set();

  for (const excel of excelLoans) {
    const selection = chooseMatch(excel, appByName, matchedAppIds);
    if (selection.ambiguous) {
      ambiguousMatches.push({
        excel,
        candidates: selection.candidates.map(({ app, score }) => ({ score, ...app })),
      });
      continue;
    }
    if (!selection.match) {
      unmatchedExcel.push(excel);
      continue;
    }

    const app = selection.match;
    matchedAppIds.add(app.id);
    const beforeDiff = roundMoney(app.appBalance - excel.excelBalance);
    const missingCells = excel.payments.filter((payment) => {
      if (!payment.date) return false;
      const key = `${app.id}|${payment.date}|${payment.amount.toFixed(2)}`;
      return !existingPayments.has(key);
    });

    let chosenCells = [];
    let expectedBalanceAfter = app.appBalance;
    let remainingDiffAfter = beforeDiff;
    let action = 'none';

    if (beforeDiff > EPSILON) {
      const exactSubset = subsetEqual(missingCells, beforeDiff);
      if (exactSubset) {
        chosenCells = exactSubset;
        expectedBalanceAfter = roundMoney(app.appBalance - chosenCells.reduce((sum, payment) => sum + payment.amount, 0));
        remainingDiffAfter = roundMoney(expectedBalanceAfter - excel.excelBalance);
        action = 'insert_exact_missing_payments';
      } else {
        const missingSum = roundMoney(missingCells.reduce((sum, payment) => sum + payment.amount, 0));
        unresolvedMismatches.push({
          reason: 'missing_excel_payments_do_not_equal_balance_gap',
          excelRow: excel.row,
          name: excel.name,
          loanId: app.id,
          excelBalance: excel.excelBalance,
          appBalance: app.appBalance,
          balanceGapAppMinusExcel: beforeDiff,
          missingExcelPaymentSum: missingSum,
          missingPaymentCells: missingCells,
        });
      }
    } else if (beforeDiff < -EPSILON) {
      unresolvedMismatches.push({
        reason: 'app_balance_already_lower_than_excel',
        excelRow: excel.row,
        name: excel.name,
        loanId: app.id,
        excelBalance: excel.excelBalance,
        appBalance: app.appBalance,
        balanceGapAppMinusExcel: beforeDiff,
      });
    }

    for (const payment of chosenCells) {
      if (roundMoney(app.appBalance - payment.amount) < excel.excelBalance - EPSILON && chosenCells.length === 1) {
        unsafeOverpay.push({ excel, app, payment });
        continue;
      }
      proposedPayments.push({
        id: crypto.randomUUID(),
        loan_id: app.id,
        borrower_id: app.borrowerId,
        collector_id: app.collectorId,
        amount: payment.amount,
        payment_date: `${payment.date}T08:00:00+08:00`,
        receipt_number: null,
        notes: `May 16 DATA of Clients import: ${SHEET_NAME} row ${payment.row} col ${payment.col}`,
        encoded_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source: {
          sheet: SHEET_NAME,
          row: payment.row,
          col: payment.col,
          excelName: excel.name,
        },
      });
    }

    matched.push({
      excelRow: excel.row,
      name: excel.name,
      appLoanId: app.id,
      loanNumber: app.loanNumber,
      principalExcel: excel.principal,
      principalApp: app.principal,
      totalLoanExcel: excel.totalLoan,
      totalLoanApp: app.totalLoan,
      excelBalance: excel.excelBalance,
      appBalanceBefore: app.appBalance,
      balanceDiffAppMinusExcelBefore: beforeDiff,
      proposedPaymentCount: chosenCells.length,
      proposedPaymentAmount: roundMoney(chosenCells.reduce((sum, payment) => sum + payment.amount, 0)),
      appBalanceAfterProposed: expectedBalanceAfter,
      balanceDiffAppMinusExcelAfter: remainingDiffAfter,
      action,
      releaseDateExcel: excel.releaseDate,
      releaseDateApp: app.releaseDate,
      batchTitle: excel.batchTitle,
    });
  }

  const appOnly = appLoans.filter((loan) => !matchedAppIds.has(loan.id));
  const executableMatched = matched.filter((row) => row.action === 'none' || row.action === 'insert_exact_missing_payments');
  const finalMismatches = matched.filter((row) => Math.abs(row.balanceDiffAppMinusExcelAfter) > EPSILON);

  return {
    generatedAt: new Date().toISOString(),
    columnRange: {
      start: XLSX.utils.encode_col(PAYMENT_START_COL),
      end: XLSX.utils.encode_col(PAYMENT_END_COL),
      endIncluded: XLSX.utils.encode_col(PAYMENT_END_COL) === 'CE',
    },
    summary: {
      excelLoans: excelLoans.length,
      appLoans: appLoans.length,
      matched: matched.length,
      executableMatched: executableMatched.length,
      unmatchedExcel: unmatchedExcel.length,
      ambiguousMatches: ambiguousMatches.length,
      appOnly: appOnly.length,
      proposedPayments: proposedPayments.length,
      proposedPaymentAmount: roundMoney(proposedPayments.reduce((sum, payment) => sum + payment.amount, 0)),
      unsafeOverpay: unsafeOverpay.length,
      unresolvedMismatches: unresolvedMismatches.length,
      finalMismatchesAfterProposed: finalMismatches.length,
    },
    matched,
    proposedPayments,
    unresolvedMismatches,
    unmatchedExcel,
    ambiguousMatches,
    unsafeOverpay,
    appOnly,
    finalMismatches,
  };
}

async function insertPayments(client, proposedPayments) {
  const rows = proposedPayments.map(({ source, ...payment }) => payment);
  if (rows.length === 0) return 0;

  await client.query('begin');
  try {
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const values = [];
      const placeholders = batch.map((payment, rowIndex) => {
        const base = rowIndex * 11;
        values.push(
          payment.id,
          payment.loan_id,
          payment.borrower_id,
          payment.collector_id,
          payment.amount,
          payment.payment_date,
          payment.receipt_number,
          payment.notes,
          payment.encoded_at,
          payment.created_at,
          payment.updated_at,
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`;
      }).join(',');

      await client.query(`
        insert into app_payments (
          id, loan_id, borrower_id, collector_id, amount, payment_date,
          receipt_number, notes, encoded_at, created_at, updated_at
        )
        values ${placeholders}
      `, values);
    }
    await client.query('commit');
    return rows.length;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

function writeReport(args, report, suffix = 'dry-run') {
  fs.mkdirSync(args.outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(args.outputDir, `may16-data-clients-reconciliation-${suffix}-${stamp}.json`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  return jsonPath;
}

async function runOnce(client, args) {
  const { loans: excelLoans } = extractExcelLoans(args.excelPath);
  const { appLoans, existingPayments } = await fetchAppData(client);
  return buildReconciliation(excelLoans, appLoans, existingPayments);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const client = makeClient(env, args);
  await client.connect();

  try {
    const report = await runOnce(client, args);
    const reportPath = writeReport(args, report, args.execute ? 'pre-execute' : 'dry-run');

    console.log('May 16 DATA of Clients reconciliation');
    console.log(JSON.stringify(report.summary, null, 2));
    console.log(`Report: ${reportPath}`);

    const blockers = [
      ['ambiguousMatches', report.summary.ambiguousMatches],
      ['unsafeOverpay', report.summary.unsafeOverpay],
    ].filter(([, count]) => count > 0);

    if (!args.execute) {
      console.log('Dry-run only. Re-run with --execute after reviewing the report.');
      return;
    }

    if (blockers.length > 0) {
      throw new Error(`Execution blocked: ${blockers.map(([name, count]) => `${name}=${count}`).join(', ')}`);
    }

    const inserted = await insertPayments(client, report.proposedPayments);
    console.log(`Inserted payments: ${inserted}`);

    const postReport = await runOnce(client, args);
    const postPath = writeReport(args, postReport, 'post-execute');
    console.log('Post-execute verification');
    console.log(JSON.stringify(postReport.summary, null, 2));
    console.log(`Post report: ${postPath}`);

    if (postReport.summary.proposedPayments > 0) {
      throw new Error('Post-execute verification still has remaining executable proposed payments.');
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
