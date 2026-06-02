import * as xlsx from 'xlsx';
import fs from 'fs';

const files = [
  'd:/GitHub/n3/files (1)/WEEKLY-DCS-angelica.xlsx',
  'd:/GitHub/n3/files (1)/WEEKLY-DCS-meshelle.xlsx'
];

for (const file of files) {
  console.log(`\n=== Analyzing ${file} ===`);
  try {
    const buffer = fs.readFileSync(file);
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;
    console.log(`Sheets: ${sheetNames.join(', ')}`);

    for (const sheetName of sheetNames) {
      console.log(`\n--- Sheet: ${sheetName} ---`);
      const sheet = workbook.Sheets[sheetName];
      const json = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      
      console.log(`Total rows: ${json.length}`);
      
      if (json.length > 5 && sheetName.toLowerCase().includes('weekly')) {
        const row1 = json[1] || []; // Dates
        const row2 = json[2] || []; // Sub-headers
        const row3 = json[3] || []; // Main headers
        const row4 = json[4] || []; // First data row

        console.log("Main Headers (Row 3):", row3.slice(0, 25));
        
        let paymentCols = [];
        for (let c = 25; c < row1.length; c++) {
          if (row1[c]) {
            let dateVal = row1[c];
            if (typeof dateVal === 'number') {
              const utc_days = Math.floor(dateVal - 25569);
              dateVal = new Date(utc_days * 86400 * 1000).toISOString().split('T')[0];
            }
            paymentCols.push(`Col ${c}: Date ${dateVal}`);
          }
        }
        console.log("Payment Dates:", paymentCols.slice(0, 5));
        console.log("Payment sub-headers (Col 25+):", row2.slice(25, 30));
        console.log("First data row Payment data:", row4.slice(25, 35));
      }

    }
  } catch (err) {
    console.error(`Error reading ${file}:`, err.message);
  }
}
