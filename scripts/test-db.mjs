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
    SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'app_payments'
  `);
  console.log('app_payments columns:', rows);
  
  // also app_loans
  const { rows: rows2 } = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'app_loans'
  `);
  console.log('app_loans columns:', rows2);
  
  await client.end();
}
run();
