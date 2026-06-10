import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const SUPABASE_URL = 'https://qtkdnpbbukjamqgvbaeh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YXjolA9mlvLplSA3pY-2FA_b9sJ0PO6';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function cleanName(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const t = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!t || /^(total|grand|sum|overall|batch|name of client|weekly)/i.test(t)) return null;
  return t;
}

async function fetchAll(table, select = '*') {
  let allData = [];
  let from = 0;
  const size = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + size - 1);
    if (error) throw error;
    if (data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < size) break;
    from += size;
  }
  return allData;
}

async function main() {
  console.log('Fetching collectors...');
  const collectors = await fetchAll('app_collectors');
  const angelica = collectors.find(c => c.full_name.toLowerCase().includes('angelica'));
  const mechelle = collectors.find(c => c.full_name.toLowerCase().includes('mechelle') || c.full_name.toLowerCase().includes('meshelle'));

  if (!angelica || !mechelle) {
    console.error('Collectors not found');
    return;
  }

  console.log('Fetching borrowers...');
  const borrowers = await fetchAll('app_borrowers', 'id, full_name, collector_id');
  const borrowerMap = new Map();
  for (const b of borrowers) {
    const cName = cleanName(b.full_name);
    if (cName) borrowerMap.set(cName, b);
  }

  console.log('Fetching active loans...');
  const loans = await fetchAll('app_loans', 'id, borrower_id, status, collector_id, installment_amount, savings_per_payment, insurance_amount');
  const activeLoansByBorrower = new Map();
  for (const l of loans) {
    if (l.status === 'active' || l.status === 'paid') {
      if (!activeLoansByBorrower.has(l.borrower_id) || l.status === 'active') {
        activeLoansByBorrower.set(l.borrower_id, l);
      }
    }
  }

  const files = [
    { path: 'files (1)/WEEKLY-DCS-angelica.xlsx', collectorId: angelica.id, name: 'Angelica' },
    { path: 'files (1)/WEEKLY-DCS-meshelle.xlsx', collectorId: mechelle.id, name: 'Mechelle' }
  ];

  let borrowerUpdateCount = 0;
  let loanUpdateCount = 0;
  let discrepancies = [];

  for (const file of files) {
    const wb = XLSX.readFile(file.path);
    
    for (const sheetName of wb.SheetNames) {
      if (/summary|friday/i.test(sheetName)) continue;
      
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet);
      
      for (const row of rows) {
        const rawName = row['__EMPTY'];
        const cName = cleanName(rawName);
        if (!cName) continue;

        const prin = Number(row['__EMPTY_11']) || Number(row['__EMPTY_10']) || 0; 
        const deposit = Number(row['__EMPTY_12']) || 0;
        const insurance = Number(row['__EMPTY_13']) || 0;
        const total = Number(row['__EMPTY_14']) || 0;

        const borrower = borrowerMap.get(cName);
        if (!borrower) continue;

        if (borrower.collector_id !== file.collectorId) {
          const { error } = await supabase.from('app_borrowers').update({ collector_id: file.collectorId }).eq('id', borrower.id);
          if (!error) {
            borrower.collector_id = file.collectorId; 
            borrowerUpdateCount++;
          }
        }

        const loan = activeLoansByBorrower.get(borrower.id);
        if (loan) {
          if (loan.collector_id !== file.collectorId) {
            const { error } = await supabase.from('app_loans').update({ collector_id: file.collectorId }).eq('id', loan.id);
            if (!error) {
              loan.collector_id = file.collectorId;
              loanUpdateCount++;
            }
          }

          const dbPrin = Number(loan.installment_amount) || 0;
          const dbDeposit = Number(loan.savings_per_payment) || 0;
          const dbInsurance = Number(loan.insurance_amount) || 0;

          const mismatches = [];
          if (Math.abs(dbPrin - prin) > 1 && prin > 0) mismatches.push(`Prin: DB=${dbPrin}, Excel=${prin}`);
          if (Math.abs(dbDeposit - deposit) > 1 && deposit > 0) mismatches.push(`Deposit: DB=${dbDeposit}, Excel=${deposit}`);
          if (Math.abs(dbInsurance - insurance) > 1 && insurance > 0) mismatches.push(`Insurance: DB=${dbInsurance}, Excel=${insurance}`);

          if (mismatches.length > 0) {
            discrepancies.push({
              borrower: borrower.full_name,
              sheet: sheetName,
              mismatches: mismatches.join(' | ')
            });
          }
        }
      }
    }
  }

  console.log(`✅ Finished. Updated Borrowers: ${borrowerUpdateCount}, Updated Loans: ${loanUpdateCount}`);
  console.log(`\n--- Discrepancies Found (${discrepancies.length}) ---`);
  for (const d of discrepancies) {
    console.log(`${d.borrower} (${d.sheet}): ${d.mismatches}`);
  }
}

main().catch(console.error);
