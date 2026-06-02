/**
 * inspect-weekly-excel-columns.mjs
 * Print the raw Excel row data for a few known borrowers to understand column mapping
 */

import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FILE = path.resolve(__dirname, '..', 'files (1)', 'WEEKLY-DCS-angelica.xlsx');

const workbook = xlsx.read(fs.readFileSync(FILE), { type: 'buffer' });
const sheetNames = workbook.SheetNames;
const weeklySheetName = sheetNames.find(name => name.toLowerCase().includes('weekly'));
const sheet = workbook.Sheets[weeklySheetName];
const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

// Print header rows (rows 0-4) to understand column labels
console.log('=== HEADER ROWS (0-4) ===');
for (let i = 0; i <= 4; i++) {
  const row = rawData[i] || [];
  const relevant = row.slice(0, 25); // first 25 columns
  console.log(`Row ${i}: ${JSON.stringify(relevant)}`);
}

// Print first few data rows (rows 4-10) with column indices
console.log('\n=== FIRST 5 BORROWER ROWS (cols 0-20) ===');
for (let r = 4; r < 12; r++) {
  const row = rawData[r];
  if (!row || !row[0]) continue;
  console.log(`\nRow ${r}: ${row[0]}`);
  for (let c = 0; c <= 20; c++) {
    if (row[c] !== null && row[c] !== undefined && row[c] !== '') {
      console.log(`  col[${c}] = ${row[c]}`);
    }
  }
}

// Find a specific borrower to verify
const targetName = 'Rosalinda R. Navarro';
console.log(`\n=== SPECIFIC BORROWER: ${targetName} ===`);
for (let r = 4; r < rawData.length; r++) {
  const row = rawData[r];
  if (!row || !row[0]) continue;
  if (row[0].toString().trim() === targetName) {
    console.log(`Found at row ${r}:`);
    for (let c = 0; c <= 20; c++) {
      console.log(`  col[${c}] = ${row[c]}`);
    }
    // Also show first payment block
    const subHeaderRow = rawData[2] || [];
    let maxLength = 0;
    for (const ro of rawData) { if (ro && ro.length > maxLength) maxLength = ro.length; }
    for (let c = 25; c < Math.min(40, maxLength); c++) {
      if (row[c] !== null && row[c] !== undefined && row[c] !== '') {
        console.log(`  col[${c}] = ${row[c]}  (subHeader: ${subHeaderRow[c]})`);
      }
    }
    break;
  }
}
