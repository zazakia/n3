const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.SUPABASE_DB_HOST     || '127.0.0.1',
  port:     Number(process.env.SUPABASE_DB_PORT || '55322'),
  database: process.env.SUPABASE_DB_NAME     || 'postgres',
  user:     process.env.SUPABASE_DB_USER     || 'postgres',
  password: process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD || 'postgres',
});

async function clean() {
  const client = await pool.connect();
  try {
    console.log("Deleting Weekly Payments...");
    await client.query("DELETE FROM app_payments WHERE notes = 'Weekly Migration' OR notes LIKE 'Rollover clearing from Loan LN-WKLY-%'");
    
    console.log("Deleting Weekly Savings...");
    await client.query("DELETE FROM app_savings_transactions WHERE notes LIKE 'Weekly CBU Collection from LN-WKLY-%'");

    console.log("Deleting Weekly Loans...");
    await client.query("DELETE FROM app_loans WHERE loan_number LIKE 'LN-WKLY-%'");

    console.log("Successfully cleaned weekly data.");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    client.release();
    pool.end();
  }
}

clean();
