const { Client } = require('pg');
require('dotenv').config({ path: 'd:/GitHub/n3/.env' });

async function check() {
  const client = new Client({
    host: process.env.SUPABASE_DB_HOST || '127.0.0.1',
    port: Number(process.env.SUPABASE_DB_PORT || '55322'),
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    user: process.env.SUPABASE_DB_USER || 'postgres',
    password: process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD || 'postgres'
  });
  await client.connect();

  const { rows } = await client.query(`
    SELECT b.full_name
    FROM app_borrowers b
    JOIN app_loans l ON b.id::text = l.borrower_id::text
    WHERE l.deleted_at IS NULL AND b.deleted_at IS NULL
    GROUP BY b.full_name
    HAVING COUNT(DISTINCT CASE WHEN l.loan_number LIKE 'LN-WKLY-%' THEN 'weekly' ELSE 'daily' END) > 1
  `);

  console.log('Borrowers with multiple loan types:', rows.map(r => r.full_name));

  const { rows: both } = await client.query(`
    SELECT b.full_name
    FROM app_borrowers b
    JOIN app_loans l ON b.id::text = l.borrower_id::text
    WHERE l.deleted_at IS NULL AND b.deleted_at IS NULL
    GROUP BY b.full_name
    HAVING 
      SUM(CASE WHEN l.loan_number LIKE 'LN-WKLY-%' THEN 1 ELSE 0 END) > 0 
      AND 
      SUM(CASE WHEN l.loan_number NOT LIKE 'LN-WKLY-%' THEN 1 ELSE 0 END) > 0
  `);
  
  console.log('Borrowers with BOTH daily and weekly loans:', both.map(r => r.full_name));

  await client.end();
}
check();
