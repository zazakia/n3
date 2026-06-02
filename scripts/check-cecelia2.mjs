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
    const lId = '93d1a285-c89e-43a4-8889-fc2c950d2f12';
    const { rows: schedules } = await client.query(`SELECT id, scheduled_amount, due_date, status, deleted_at FROM public.app_payment_schedules WHERE loan_id = $1`, [lId]);
    console.log(`Total schedules: ${schedules.length}`);
    const active = schedules.filter(s => !s.deleted_at);
    const deleted = schedules.filter(s => s.deleted_at);
    console.log(`Active schedules: ${active.length}, sum: ${active.reduce((sum, s) => sum + Number(s.scheduled_amount), 0)}`);
    console.log(`Deleted schedules: ${deleted.length}, sum: ${deleted.reduce((sum, s) => sum + Number(s.scheduled_amount), 0)}`);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
