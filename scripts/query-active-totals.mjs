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
      COUNT(*) as count,
      SUM(l.principal_amount) as total_principal,
      SUM(l.total_amount - COALESCE(p.paid, 0)) as total_balance
    FROM app_loans l
    LEFT JOIN (
      SELECT loan_id, SUM(amount) as paid 
      FROM app_payments 
      GROUP BY loan_id
    ) p ON l.id = p.loan_id
    WHERE l.status = 'active';
  `;
  
  const res = await client.query(query);
  console.log('Active Loans:', res.rows[0].count);
  console.log('Total Principal:', res.rows[0].total_principal);
  console.log('Total Balance:', res.rows[0].total_balance);
  
  await client.end();
}
run();
