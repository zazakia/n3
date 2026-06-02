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
  const { rows } = await client.query(`
    SELECT b.first_name, b.last_name, l.id, l.total_amount, l.status,
           COALESCE(SUM(p.amount), 0) as paid,
           (l.total_amount - COALESCE(SUM(p.amount), 0)) as calculated_balance
    FROM app_borrowers b
    JOIN app_loans l ON l.borrower_id::text = b.id::text
    LEFT JOIN app_payments p ON p.loan_id::text = l.id::text
    WHERE b.last_name ILIKE ANY(ARRAY['%cagabhion%', '%coraza%', '%junio%', '%matuguina%', '%cuan%'])
    GROUP BY b.id, l.id
    ORDER BY b.last_name, l.created_at
  `);
  console.table(rows);
  await client.end();
}
run();
