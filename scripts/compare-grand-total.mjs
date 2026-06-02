import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workbook = XLSX.readFile(path.join(__dirname, '..', 'files (1)', 'DCM-as-of-May-30.xlsx'));
const sheet = workbook.Sheets['DATA of Clients'];

function getDependencies(cellRef) {
  const cell = sheet[cellRef];
  if (!cell) return [];
  if (!cell.f) {
    if (parseFloat(cell.v) > 0) return [cellRef];
    return [];
  }
  
  const deps = [];
  if (cell.f.includes('SUM')) {
    const m = cell.f.match(/S(\d+):S(\d+)/);
    if (m) {
      const start = parseInt(m[1], 10);
      const end = parseInt(m[2], 10);
      for(let i=start; i<=end; i++) deps.push('S'+i);
      return deps;
    }
  }
  const tokens = cell.f.match(/S[0-9]+/g) || [];
  return tokens;
}

const batchCells = getDependencies('S855');
const excelIncludedRows = new Set();
let totalSum = 0;

batchCells.forEach(bCell => {
  const deps = getDependencies(bCell);
  deps.forEach(d => {
    const r = parseInt(d.replace('S', ''), 10);
    excelIncludedRows.add(r);
    const val = sheet['S'+r] ? parseFloat(sheet['S'+r].v) : 0;
    if (!isNaN(val)) totalSum += val;
  });
});

console.log('Total sum of all dependent cells:', totalSum);

// Now load loans.json
const loans = JSON.parse(fs.readFileSync(path.join(__dirname, 'migration-data', 'loans.json'), 'utf-8'));

let appTotal = 0;
const appActiveRows = new Set();

loans.forEach(l => {
  if (l.status === 'active') {
    appActiveRows.add(l.source_row);
    // the DB calculates balance as total_loan - sum(payments).
    // but here we just use what Excel stated as the balance because we already auto-adjusted the DB to match this exactly.
    // wait, what if the active balance in DB is 0?
    // auto-adjust forces DB to match excel expected balance for this specific loan row.
    appTotal += (l.total_loan_balance || 0);
  }
});

console.log('App active total:', appTotal);

// Compare!
console.log('\n--- Loans in EXCEL GRAND TOTAL but NOT ACTIVE in APP ---');
let diffAppLower = 0;
[...excelIncludedRows].sort((a,b)=>a-b).forEach(r => {
  if (!appActiveRows.has(r)) {
    const loan = loans.find(l => l.source_row === r);
    const val = sheet['S'+r] ? parseFloat(sheet['S'+r].v) : 0;
    if (val > 0) {
      console.log(`Row ${r}: Excel claims ${val}. App status: ${loan ? loan.status : 'NOT FOUND'} (Borrower: ${loan ? loan.borrower_ref : '?'})`);
      diffAppLower += val;
    }
  }
});
console.log('Total Extra in Excel:', diffAppLower);

console.log('\n--- Loans ACTIVE in APP but NOT in EXCEL GRAND TOTAL ---');
let diffAppHigher = 0;
[...appActiveRows].sort((a,b)=>a-b).forEach(r => {
  if (!excelIncludedRows.has(r)) {
    const loan = loans.find(l => l.source_row === r);
    const val = loan.total_loan_balance || 0;
    if (val > 0) {
      console.log(`Row ${r}: App claims ${val}. Excel Grand Total omitted it! (Borrower: ${loan.borrower_ref})`);
      diffAppHigher += val;
    }
  }
});
console.log('Total Extra in App:', diffAppHigher);

console.log('\nNet Difference:', diffAppHigher - diffAppLower);
