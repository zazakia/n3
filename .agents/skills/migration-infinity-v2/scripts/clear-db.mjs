import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function clearData() {
  const client = new Client({
    host: process.env.SUPABASE_DB_HOST || '127.0.0.1',
    port: Number(process.env.SUPABASE_DB_PORT || '55322'),
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    user: process.env.SUPABASE_DB_USER || 'postgres',
    password: process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD || 'postgres',
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const tables = [
      'app_payment_schedules',
      'app_payments',
      'app_collection_logs',
      'app_loan_penalties',
      'app_loans',
      'app_borrowers',
    ];

    for (const table of tables) {
      const res = await client.query(`DELETE FROM public.${table}`);
      console.log(`Cleared ${table}: ${res.rowCount} rows deleted`);
    }

    console.log('\nAll loan/borrower/payment data cleared.');
    
    // Reload Cache
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('PostgREST schema cache reloaded');

  } catch (err) {
    console.error('Error clearing data:', err);
  } finally {
    await client.end();
  }
}

clearData();
