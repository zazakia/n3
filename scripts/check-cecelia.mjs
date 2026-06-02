import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

function getDbConfig() {
  return {
    host: process.env.SUPABASE_DB_HOST || '127.0.0.1',
    port: Number(process.env.SUPABASE_DB_PORT || '55322'),
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    user: process.env.SUPABASE_DB_USER || 'postgres',
    password: process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD || 'postgres',
  };
}

async function run() {
  const client = new pg.Client(getDbConfig());
  await client.connect();
  try {
    const { rows: borrowers } = await client.query(`SELECT * FROM public.app_borrowers WHERE full_name ILIKE '%Cecelia%' OR full_name ILIKE '%Alao%'`);
    console.log('Borrowers:', borrowers);
    
    if (borrowers.length > 0) {
      const bId = borrowers[0].id;
      const { rows: loans } = await client.query(`SELECT * FROM public.app_loans WHERE borrower_id = $1`, [bId]);
      console.log('Loans:', loans.map(l => ({ id: l.id, total_amount: l.total_amount, principal_amount: l.principal_amount, status: l.status })));
      
      for (const l of loans) {
        const { rows: schedules } = await client.query(`SELECT SUM(scheduled_amount) as total_sched FROM public.app_payment_schedules WHERE loan_id = $1`, [l.id]);
        console.log(`Loan ${l.id} schedule sum:`, schedules[0].total_sched);
        
        const { rows: payments } = await client.query(`SELECT SUM(amount) as total_paid FROM public.app_payments WHERE loan_id = $1`, [l.id]);
        console.log(`Loan ${l.id} payment sum:`, payments[0].total_paid);
      }
    }
  } finally {
    await client.end();
  }
}

run().catch(console.error);
