import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

const workbookPath = process.argv[2] ?? 'D:/Users/HI/Downloads/DCM-as-of-May-1.xlsx';
const exportsDir = process.argv[3] ?? 'DCM_Migration_Exports';

const money = (value) => {
  if (value == null || value === '') return 0;
  const n = Number(String(value).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const clean = (value) => String(value ?? '').trim();
const cleanName = (value) => clean(value).replace(/\s+/g, ' ').toLowerCase();

const readCsv = (file) => {
  const workbook = XLSX.readFile(path.join(exportsDir, file), { raw: false });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
};

const workbook = XLSX.readFile(workbookPath, { cellDates: false });
const allRows = [];
const sheetPreviews = {};

for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false });
  sheetPreviews[sheetName] = rows.slice(0, 5);
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.some((cell) => clean(cell))) {
      allRows.push({ sheetName, rowNumber: index + 1, row });
    }
  }
}

const loans = readCsv('staging_loans.csv');
const clients = readCsv('staging_clients.csv');
const payments = readCsv('staging_payments.csv');
const issues = readCsv('migration_issues.csv');

const summaryRows = [];
for (const sheetName of workbook.SheetNames.filter((name) => name !== 'DATA of Clients')) {
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false, blankrows: false });
  const headerIndex = rows.findIndex((row) => row.some((cell) => /name of client/i.test(clean(cell))));
  if (headerIndex === -1) continue;
  const header = rows[headerIndex].map((cell) => clean(cell).toLowerCase());
  const nameIndex = header.findIndex((cell) => cell.includes('name of client'));
  const collectorIndex = header.findIndex((cell) => cell.includes('collector'));
  const loanAmountIndex = header.findIndex((cell) => cell.includes('loan amount'));
  const totalPaymentsIndex = header.findIndex((cell) => cell.includes('total payment'));
  const balanceIndex = header.findIndex((cell) => cell.includes('total loan balance'));
  const explicitCollector = rows
    .flat()
    .map(clean)
    .find((cell) => /^collector\s*:/i.test(cell))
    ?.replace(/^collector\s*:\s*/i, '');

  for (const row of rows.slice(headerIndex + 1)) {
    const name = clean(row[nameIndex]);
    if (!name || /^(total|grand total)$/i.test(name)) continue;
    const loanAmount = money(row[loanAmountIndex]);
    const balance = money(row[balanceIndex]);
    if (loanAmount <= 0 && balance <= 0) continue;
    summaryRows.push({
      sheetName,
      client_name: name,
      collector: clean(row[collectorIndex]) || explicitCollector || sheetName,
      loan_amount: loanAmount,
      total_payments: money(row[totalPaymentsIndex]),
      total_loan_balance: balance,
    });
  }
}

const summaryTotalsByCollector = new Map();
for (const row of summaryRows) {
  const key = clean(row.collector) || '(blank)';
  const current = summaryTotalsByCollector.get(key) ?? { rows: 0, loanAmount: 0, totalPayments: 0, balance: 0 };
  current.rows += 1;
  current.loanAmount += row.loan_amount;
  current.totalPayments += row.total_payments;
  current.balance += row.total_loan_balance;
  summaryTotalsByCollector.set(key, current);
}

const borrowerLikeRows = allRows.filter(({ row }) => {
  const joined = row.map(clean).join('|').toLowerCase();
  const hasName = clean(row[0]) && !/^(client|name|total|grand total|monthly|weekly)$/i.test(clean(row[0]));
  const hasLoanNumber = row.some((cell) => money(cell) > 0);
  return hasName && hasLoanNumber && !joined.includes('collector') && !joined.includes('batch');
});

const loanSourceDuplicateCount = loans.length - new Set(loans.map((loan) => `${loan.source_sheet}#${loan.source_row}`)).size;
const paymentSourceDuplicateCount = payments.length - new Set(payments.map((payment) => `${payment.source_sheet}#${payment.source_row}#${payment.source_col}`)).size;
const dataClientsRows = workbook.Sheets['DATA of Clients']
  ? XLSX.utils.sheet_to_json(workbook.Sheets['DATA of Clients'], { header: 1, defval: '', raw: false, blankrows: false })
  : [];
const dataClientsColumnPreview = [2, 3, 4].map((rowIndex) => ({
  rowNumber: rowIndex + 1,
  columns: (dataClientsRows[rowIndex] ?? []).slice(0, 30).map((value, index) => ({ index, value })),
}));

const bySheetAndRow = new Map(allRows.map((entry) => [`${entry.sheetName}#${entry.rowNumber}`, entry]));
const scoreOffset = (offset) => loans.slice(0, 200).reduce((matches, loan) => {
  const entry = bySheetAndRow.get(`${loan.source_sheet}#${Number(loan.source_row) - offset}`);
  return matches + (entry && cleanName(entry.row[0]) === cleanName(loan.client_name) ? 1 : 0);
}, 0);
const detectedSourceRowOffset = [...Array(41).keys()]
  .map((value) => value - 20)
  .map((offset) => ({ offset, matches: scoreOffset(offset) }))
  .sort((a, b) => b.matches - a.matches)[0];

const getSourceEntry = (record) => bySheetAndRow.get(
  `${record.source_sheet}#${Number(record.source_row) - detectedSourceRowOffset.offset}`,
);

const loansMissingSource = loans.filter((loan) => !getSourceEntry(loan));
const paymentsMissingSource = payments.filter((payment) => !getSourceEntry(payment));
const workbookSourceRowsUsedByLoans = new Set(
  loans.map((loan) => `${loan.source_sheet}#${Number(loan.source_row) - detectedSourceRowOffset.offset}`),
);
const workbookRowsNotInLoans = borrowerLikeRows.filter(
  (entry) => !workbookSourceRowsUsedByLoans.has(`${entry.sheetName}#${entry.rowNumber}`),
);

const loanFieldChecks = [
  ['client_name', 0, 'text'],
  ['collector', 5, 'text'],
  ['days', 6, 'number'],
  ['batch', 7, 'number'],
  ['cycle', 8, 'number'],
  ['loan_amount', 11, 'money'],
  ['daily', 12, 'money'],
  ['interest', 13, 'money'],
  ['total_payment', 14, 'money'],
  ['net_loan', 15, 'money'],
  ['total_loan', 17, 'money'],
  ['total_loan_balance', 18, 'money'],
];

const sameValue = (left, right, kind) => {
  if (kind === 'text') return cleanName(left) === cleanName(right);
  const a = money(left);
  const b = money(right);
  if (clean(left) === '' && clean(right) === '') return true;
  return Math.abs(a - b) < 0.01;
};

const loanValueMismatches = [];
for (const loan of loans) {
  const entry = getSourceEntry(loan);
  if (!entry) continue;
  for (const [field, colIndex, kind] of loanFieldChecks) {
    if (!sameValue(loan[field], entry.row[colIndex], kind)) {
      loanValueMismatches.push({
        loan_stage_id: loan.loan_stage_id,
        client_name: loan.client_name,
        source: `${loan.source_sheet}!row ${loan.source_row}`,
        workbookRow: entry.rowNumber,
        field,
        exportValue: loan[field],
        workbookValue: entry.row[colIndex],
      });
    }
  }
}

const paymentValueMismatches = [];
for (const payment of payments) {
  const entry = getSourceEntry(payment);
  if (!entry) continue;
  const zeroBasedCol = Number(payment.source_col) - 1;
  if (!sameValue(payment.amount, entry.row[zeroBasedCol], 'money')) {
    paymentValueMismatches.push({
      payment_stage_id: payment.payment_stage_id,
      loan_stage_id: payment.loan_stage_id,
      client_name: payment.client_name,
      source: `${payment.source_sheet}!row ${payment.source_row} col ${payment.source_col}`,
      workbookRow: entry.rowNumber,
      exportValue: payment.amount,
      workbookValue: entry.row[zeroBasedCol],
    });
  }
}

const totals = {
  workbook: {
    sheets: workbook.SheetNames.length,
    nonEmptyRows: allRows.length,
    borrowerLikeRows: borrowerLikeRows.length,
  },
  exports: {
    clients: clients.length,
    loans: loans.length,
    payments: payments.length,
    issues: issues.length,
    loanAmount: loans.reduce((sum, loan) => sum + money(loan.loan_amount), 0),
    totalLoan: loans.reduce((sum, loan) => sum + money(loan.total_loan), 0),
    totalBalance: loans.reduce((sum, loan) => sum + money(loan.total_loan_balance), 0),
    paymentAmount: payments.reduce((sum, payment) => sum + money(payment.amount), 0),
  },
  may1SummarySheets: {
    rows: summaryRows.length,
    loanAmount: summaryRows.reduce((sum, row) => sum + row.loan_amount, 0),
    totalPayments: summaryRows.reduce((sum, row) => sum + row.total_payments, 0),
    balance: summaryRows.reduce((sum, row) => sum + row.total_loan_balance, 0),
  },
  sourceLinks: {
    detectedSourceRowOffset,
    loansMissingSource: loansMissingSource.length,
    paymentsMissingSource: paymentsMissingSource.length,
    loanSourceDuplicateCount,
    paymentSourceDuplicateCount,
    borrowerLikeWorkbookRowsNotInLoans: workbookRowsNotInLoans.length,
    loanValueMismatches: loanValueMismatches.length,
    paymentValueMismatches: paymentValueMismatches.length,
  },
};

const collectorTotals = new Map();
for (const loan of loans) {
  const key = clean(loan.collector) || '(blank)';
  const current = collectorTotals.get(key) ?? { loans: 0, loanAmount: 0, balance: 0 };
  current.loans += 1;
  current.loanAmount += money(loan.loan_amount);
  current.balance += money(loan.total_loan_balance);
  collectorTotals.set(key, current);
}

const samples = {
  loansMissingSource: loansMissingSource.slice(0, 10),
  paymentsMissingSource: paymentsMissingSource.slice(0, 10),
  workbookRowsNotInLoans: workbookRowsNotInLoans.slice(0, 25).map(({ sheetName, rowNumber, row }) => ({
    sheetName,
    rowNumber,
    row: row.slice(0, 12),
  })),
  clientsWithNoLoans: clients
    .filter((client) => !loans.some((loan) => cleanName(loan.client_name) === cleanName(client.client_name)))
    .slice(0, 20),
  loanValueMismatches: loanValueMismatches.slice(0, 50),
  paymentValueMismatches: paymentValueMismatches.slice(0, 50),
};

const report = {
  workbookPath,
  exportsDir,
  sheetPreviews,
  dataClientsColumnPreview,
  totals,
  collectorTotals: Object.fromEntries([...collectorTotals.entries()].sort(([a], [b]) => a.localeCompare(b))),
  may1SummaryTotalsByCollector: Object.fromEntries([...summaryTotalsByCollector.entries()].sort(([a], [b]) => a.localeCompare(b))),
  samples,
};

fs.mkdirSync('tmp', { recursive: true });
fs.writeFileSync('tmp/dcm-export-vs-excel-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
