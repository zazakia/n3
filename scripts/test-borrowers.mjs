import XLSX from 'xlsx';

const workbook = XLSX.readFile('files (1)/DCM-as-of-May-30.xlsx');
const sheet = workbook.Sheets['DATA of Clients'];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

const targets = [
  'Lucita C. Cagabhion',
  'Marissa S. Coraza',
  'Marical Junio',
  'Noime D. Matuguina',
  'Stephanie G. Cuan'
];

for (let r = 0; r < rows.length; r++) {
  const row = rows[r];
  const name = String(row[0] || '').trim();
  const match = targets.find(t => name.toLowerCase().includes(t.toLowerCase()));
  if (match) {
    console.log('\nFound:', name, 'at row', r + 1); // +1 for 1-based indexing
    const nonNulls = row.map((val, idx) => ({idx, val})).filter(x => x.val !== null);
    console.log('Row data snippet:');
    nonNulls.slice(0, 30).forEach(x => {
      console.log(`  Col ${x.idx}: ${x.val}`);
    });
  }
}
