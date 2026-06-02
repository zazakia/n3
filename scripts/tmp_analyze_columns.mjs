import * as xlsx from 'xlsx';
import fs from 'fs';

const file = './files (1)/WEEKLY-DCS-meshelle.xlsx';
const workbook = xlsx.read(fs.readFileSync(file), { type: 'buffer' });
const sheet = workbook.Sheets['Weekly'];

// Read with header: 1 gives array of arrays
const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

const row1 = rawData[1] || []; // Dates
const row2 = rawData[2] || []; // Sub-headers
const row3 = rawData[3] || []; // Main headers
const row4 = rawData[4] || []; // First data row

console.log("Column Mapping:");
for (let i = 0; i < 40; i++) {
    const colLetter = xlsx.utils.encode_col(i);
    const dateVal = row1[i];
    let dateStr = '';
    if (typeof dateVal === 'number') {
        const utc_days = Math.floor(dateVal - 25569);
        dateStr = new Date(utc_days * 86400 * 1000).toISOString().split('T')[0];
    } else {
        dateStr = dateVal ? String(dateVal) : '';
    }

    console.log(`${i.toString().padStart(2, ' ')} (${colLetter.padStart(2, ' ')}): R1=${dateStr.padEnd(12)} | R2=${String(row2[i] || '').padEnd(10)} | R3=${String(row3[i] || '').padEnd(20)} | R4=${row4[i]}`);
}

// Find max row length
let maxLength = 0;
for (const r of rawData) {
    if (r && r.length > maxLength) maxLength = r.length;
}
console.log(`\nMax columns in any row: ${maxLength} (${xlsx.utils.encode_col(maxLength - 1)})`);

// Find all payment headers based on row 2 (Sub-headers) since dates might be missing
console.log("\nPayment Columns based on 'Prin' in Row 2:");
for (let c = 25; c < maxLength; c++) {
    if (row2[c] && String(row2[c]).trim().toLowerCase() === 'prin') {
        console.log(`Found 'Prin' at index ${c} (${xlsx.utils.encode_col(c)}). Date above it: ${row1[c+1] ? row1[c+1] : 'MISSING'}`);
    }
}
