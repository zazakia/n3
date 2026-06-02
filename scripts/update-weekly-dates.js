const { Pool } = require('pg');
const xlsx = require('xlsx');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({
  host: process.env.SUPABASE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SUPABASE_DB_PORT || '55322'),
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER || 'postgres',
  password: process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD || 'postgres',
});

function excelDateToJSDate(serial) {
  if (!serial || isNaN(serial)) return null;
  const jsDate = new Date((serial - 25569) * 86400 * 1000);
  return jsDate;
}

async function updateDates() {
  const client = await pool.connect();
  const files = ['./files (1)/WEEKLY-DCS-angelica.xlsx', './files (1)/WEEKLY-DCS-meshelle.xlsx'];
  let globalLoanCount = 0;
  let updates = 0;

  for (const filepath of files) {
      let workbook = xlsx.read(fs.readFileSync(filepath), { type: 'buffer' });
      const weeklySheetName = workbook.SheetNames.find(name => name.toLowerCase().includes('weekly'));
      const sheet = workbook.Sheets[weeklySheetName];
      const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

      for (let r = 4; r < rawData.length; r++) {
          const row = rawData[r];
          if (!row || row.length === 0) continue;
          
          const clientNameRaw = row[0]?.toString().trim();
          const SKIP_ROW_RE = /^(Name Of Client|Total|Grand Total|Sub.?Total|\s*$)/i;
          const MEETING_DAY_RE = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+Meeting$/i;
          if (!clientNameRaw || SKIP_ROW_RE.test(clientNameRaw) || MEETING_DAY_RE.test(clientNameRaw)) continue;
          
          globalLoanCount++;
          const loanAmount = parseFloat(row[10]) || 0;
          if (loanAmount === 0) {
              globalLoanCount--;
              continue;
          }

          const loanNumber = 'LN-WKLY-' + globalLoanCount.toString().padStart(4, '0');

          let releaseDate = row[8] || row[22];
          if (typeof releaseDate === 'number') releaseDate = excelDateToJSDate(releaseDate)?.toISOString();
          else if (typeof releaseDate === 'string' && !isNaN(Date.parse(releaseDate))) releaseDate = new Date(releaseDate).toISOString();
          else releaseDate = null;

          let maturityDate = null;
          const termWeeks = parseInt(row[6]) || 24;
          if (releaseDate) {
              const rDate = new Date(releaseDate);
              const computedMaturity = new Date(rDate.getTime() + termWeeks * 7 * 24 * 60 * 60 * 1000);
              maturityDate = computedMaturity.toISOString();
          }

          if (releaseDate || maturityDate) {
              await client.query(
                  'UPDATE public.app_loans SET release_date = $1, maturity_date = $2, updated_at = NOW() WHERE loan_number = $3',
                  [releaseDate, maturityDate, loanNumber]
              );
              updates++;
          }
      }
  }
  
  await client.query("NOTIFY pgrst, 'reload schema'");
  client.release();
  await pool.end();
  console.log('Updated dates for ' + updates + ' weekly loans.');
}
updateDates().catch(console.error);
