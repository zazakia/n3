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
    if (name.toLowerCase().includes('data of clients')) {
      sheet = workbook.Sheets[name];
      break;
    }
  }

  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  const excelData = [];
  for (let i = 12; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    
    const nameStr = String(row[0] || '').toLowerCase();
    
    for (const clientName of clientsToFind) {
      const parts = clientName.toLowerCase().split(' ');
      const lastName = parts[parts.length - 1];
      let searchName = lastName;
      
      if (searchName === 'junior') searchName = 'marical';
      if (searchName === 'malayan') searchName = 'lorena';
      if (searchName === 'patricio') searchName = 'patricio';
      if (searchName === 'gamusa') searchName = 'gamusa';
      if (searchName === 'gulayan') searchName = 'gulayan';
      if (searchName === 'cuan') searchName = 'cuan';
      
      if (nameStr.includes(searchName)) {
        excelData.push({
          searchName: clientName,
          foundName: row[0],
          loanAmount: row[11],
          totalPayment: row[14], // total expected
          balance: row[18] // Total Loan Balance
        });
        break;
      }
    }
  }

  let md = `# Client Loan Balance Report\n\n`;
  md += `This report compares the loan balances for the requested clients based on the Excel file **DCM-as-of-May-16 (1).xlsx** and the **Production Supabase DB**.\n\n`;
  
  md += `## Summary of Findings\n\n`;

  for (const clientName of clientsToFind) {
    md += `### Client: ${clientName}\n`;
    
    // EXCEL
    const excelMatches = excelData.filter(e => e.searchName === clientName);
    md += `#### Excel Data ("DATA of Clients" sheet)\n`;
    if (excelMatches.length > 0) {
       for (const em of excelMatches) {
          md += `- **Name Found**: ${em.foundName}\n`;
          md += `- **Loan Amount**: ${em.loanAmount || 0}\n`;
          md += `- **Total Expected**: ${em.totalPayment || 0}\n`;
          md += `- **Balance in Excel**: **${em.balance !== undefined ? em.balance : 0}**\n\n`;
       }
    } else {
       md += `- *Not found in Excel* (Checked under Name Of Client column).\n\n`;
    }

    // DB
    md += `#### Production DB Data\n`;
    const parts = clientName.split(' ');
    let lastName = parts[parts.length - 1];
    if (lastName.toLowerCase() === 'junior') lastName = 'Marical';
    if (lastName.toLowerCase() === 'malayan') lastName = 'Lorena';
    
    const { data: borrowers } = await supabase
      .from('app_borrowers')
      .select('*')
      .ilike('full_name', `%${lastName}%`);
      
    const matched = (borrowers || []).filter(b => {
      const dbName = b.full_name.toLowerCase();
      return parts.some(p => dbName.includes(p.toLowerCase()));
    });

    if (matched.length === 0) {
      md += `- *Not found in DB*.\n\n`;
      continue;
    }
    
    for (const b of matched) {
      md += `- **DB Borrower Name**: ${b.full_name} (ID: ${b.id})\n`;
      const { data: app_loans, error: loanErr } = await supabase
        .from('app_loans')
        .select('*')
        .eq('borrower_id', b.id)
        .order('created_at', { ascending: false });
        
      if (loanErr || !app_loans || app_loans.length === 0) {
         md += `  - *No active loans found in DB.*\n`;
      } else {
         for (const loan of app_loans) {
            // Get payments
            const { data: payments } = await supabase
               .from('app_payments')
               .select('amount')
               .eq('loan_id', loan.id);
               
            const totalPaid = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
            const dbBalance = Number(loan.total_amount) - totalPaid;
            
            md += `  - **Loan Number**: ${loan.loan_number || loan.id}\n`;
            md += `    - Status: ${loan.status}\n`;
            md += `    - Total Amount (Expected): ${loan.total_amount}\n`;
            md += `    - Total Paid: ${totalPaid}\n`;
            md += `    - **DB Computed Balance**: **${dbBalance}**\n`;
         }
      }
      md += `\n`;
    }
    md += `---\n\n`;
  }

  console.log('MARKDOWN_START');
  console.log(md);
  console.log('MARKDOWN_END');
}

run().catch(console.error);
