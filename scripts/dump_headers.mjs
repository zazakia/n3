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
  
  console.log('HEADERS:', data[11]);
}

run().catch(console.error);
