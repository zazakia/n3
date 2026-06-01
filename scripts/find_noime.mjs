import xlsx from 'xlsx';

async function run() {
  const workbook = xlsx.readFile('e:/GitHub/n3/DCM-as-of-May-16 (1).xlsx');
  
  let sheet;
  for (const name of workbook.SheetNames) {
    if (name.toLowerCase().includes('data of clients')) {
      sheet = workbook.Sheets[name];
      break;
    }
  }

  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  let found = false;
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    
    for (let j = 0; j < row.length; j++) {
        const cellStr = String(row[j] || '').toLowerCase();
        if (cellStr.includes('noime') || cellStr.includes('matuguina')) {
           console.log(`Row ${i} matched 'Noime Matuguina'. Full row:`);
           console.log(row);
           found = true;
           break;
        }
    }
    if (found) break;
  }
}

run().catch(console.error);
