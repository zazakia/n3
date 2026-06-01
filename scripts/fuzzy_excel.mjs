import xlsx from 'xlsx';

const clientsToFind = [
  "Noime", "matuguina",
  "Maria renelyn gulayan",
  "Marical junior", "Marical", "junior", "junio",
  "Helen omega",
  "Marilu bande", "bande",
  "Stephanie Cuan", "Cuan",
  "Lorena Cagabhion Malayan", "Malayan", "Lorena",
  "Maria Lourdes Patricio", "Patricio",
  "Roy Gamusa", "Gamusa",
  "Marissa Coraza", "Coraza", "Marissa"
];

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
  
  // Find header row
  let headerRowIdx = -1;
  let nameColIdx = -1;
  let balanceColIdx = -1;

  for (let i = 0; i < Math.min(20, data.length); i++) {
     const row = data[i];
     if (!row) continue;
     for (let j = 0; j < row.length; j++) {
        const cell = String(row[j] || '').toLowerCase();
        if (cell.includes('name') || cell.includes('client')) {
           nameColIdx = j;
           headerRowIdx = i;
        }
        if (cell.includes('balance') || cell.includes('bal')) {
           balanceColIdx = j;
        }
     }
     if (nameColIdx !== -1) {
        if (balanceColIdx === -1) {
           for (let j = 0; j < row.length; j++) {
              if (String(row[j] || '').toLowerCase().includes('balance')) balanceColIdx = j;
           }
        }
        break;
     }
  }

  const excelData = [];
  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    
    for (let j = 0; j < row.length; j++) {
        const cellStr = String(row[j] || '').toLowerCase();
        for (const part of clientsToFind) {
           if (cellStr.includes(part.toLowerCase())) {
               excelData.push({
                   part,
                   name: row[nameColIdx],
                   balance: row[balanceColIdx]
               });
           }
        }
    }
  }

  // Deduplicate
  const unique = [];
  const seen = new Set();
  for (const x of excelData) {
      const key = x.name + '|' + x.balance;
      if (!seen.has(key)) {
          seen.add(key);
          unique.push(x);
      }
  }

  console.log('--- Excel Fuzzy Matches ---');
  for (const item of unique) {
     console.log(`Matched "${item.part}" -> Name: ${item.name} | Balance: ${item.balance}`);
  }
}

run().catch(console.error);
