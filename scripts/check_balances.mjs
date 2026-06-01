import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';

const supabase = createClient(
  'https://qtkdnpbbukjamqgvbaeh.supabase.co',
  'sb_publishable_YXjolA9mlvLplSA3pY-2FA_b9sJ0PO6'
);

const clientsToFind = [
  "Noime matuguina",
  "Maria renelyn gulayan",
  "Marical junior",
  "Helen omega",
  "Marilu bande",
  "Stephanie Cuan",
  "Lorena Cagabhion Malayan",
  "Maria Lourdes Patricio",
  "Roy Gamusa",
  "Marissa Coraza"
];

async function run() {
  const workbook = xlsx.readFile('e:/GitHub/n3/DCM-as-of-May-16 (1).xlsx');
  
  let sheet;
  for (const name of workbook.SheetNames) {
    if (name.toLowerCase().includes('data of clients') || name.toLowerCase().includes('client')) {
      sheet = workbook.Sheets[name];
      console.log('Using sheet:', name);
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
    
    // Check if any cell in the row matches the client name
    for (const clientName of clientsToFind) {
      let matched = false;
      let actualName = '';
      for(let j=0; j<row.length; j++) {
          const cellStr = String(row[j] || '').toLowerCase();
          if (cellStr.includes(clientName.toLowerCase())) {
              matched = true;
              actualName = row[j];
              break;
          }
      }
      
      if (matched) {
        excelData.push({
          searchName: clientName,
          foundName: actualName,
          balance: balanceColIdx !== -1 ? row[balanceColIdx] : 'N/A'
        });
      }
    }
  }

  console.log('--- Excel Data ---');
  for (const item of excelData) {
     console.log(`Found "${item.foundName}" | Match for: ${item.searchName} | Balance: ${item.balance}`);
  }

  console.log('\n--- DB Data ---');
  for (const clientName of clientsToFind) {
    const parts = clientName.split(' ');
    let lastName = parts[parts.length - 1];
    
    // In case the search has typos, maybe let's search just a part of the name
    if (lastName.toLowerCase() === 'junior') {
       lastName = 'Marical'; // For Marical junior
    } else if (lastName.toLowerCase() === 'malayan') {
       lastName = 'Malayan';
    }

    const { data: borrowers, error } = await supabase
      .from('app_borrowers')
      .select('*')
      .ilike('full_name', `%${lastName}%`);
    
    if (error) {
      console.error('Error fetching borrower:', clientName, error);
      continue;
    }

    const matched = borrowers.filter(b => {
      const dbName = b.full_name.toLowerCase();
      // check if first name or last name matches somewhat
      return parts.some(p => dbName.includes(p.toLowerCase()));
    });

    if (matched.length === 0) {
      console.log(`DB: Not found for ${clientName}`);
      continue;
    }
    
    for (const b of matched) {
      // Find app_loans
      const { data: app_loans } = await supabase
        .from('app_loans')
        .select(`*, app_payments(amount)`)
        .eq('borrower_id', b.id);
        
      console.log(`DB: ${b.full_name} -> Loans:`);
      if (app_loans && app_loans.length > 0) {
         for (const loan of app_loans) {
            let totalPaid = 0;
            if (loan.app_payments) {
               totalPaid = loan.app_payments.reduce((sum, p) => sum + p.amount, 0);
            }
            let balance = loan.total_amount - totalPaid;
            console.log(`  Loan: ${loan.loan_number || loan.id}, Total: ${loan.total_amount}, Paid: ${totalPaid}, Balance: ${balance}, Status: ${loan.status}`);
         }
      } else {
         console.log(`  No app_loans found.`);
      }
    }
  }
}

run().catch(console.error);
