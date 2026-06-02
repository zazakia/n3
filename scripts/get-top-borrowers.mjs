import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new pg.Client({
    host: process.env.SUPABASE_DB_HOST || '127.0.0.1',
    port: Number(process.env.SUPABASE_DB_PORT || '55322'),
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    user: process.env.SUPABASE_DB_USER || 'postgres',
    password: process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD || 'postgres',
  });
  await client.connect();
  
  const query = `
    SELECT 
      b.id,
      b.first_name,
      b.last_name,
      COUNT(l.id) as loan_count
    FROM app_borrowers b
    JOIN app_loans l ON b.id::text = l.borrower_id::text
    GROUP BY b.id, b.first_name, b.last_name
    ORDER BY loan_count DESC
    LIMIT 10;
  `;
  
  const res = await client.query(query);
  console.table(res.rows);
  
  await client.end();
}
run();
