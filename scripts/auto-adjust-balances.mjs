import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'migration-data');

function deterministicUUID(seed) {
  const hash = crypto.createHash('md5').update(seed).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    '8' + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

function getDbConfig(target) {
  if (target === 'local') {
    return {
      host: process.env.SUPABASE_DB_HOST || '127.0.0.1',
      port: Number(process.env.SUPABASE_DB_PORT || '55322'),
      database: process.env.SUPABASE_DB_NAME || 'postgres',
      user: process.env.SUPABASE_DB_USER || 'postgres',
      password: process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD || 'postgres',
    };
  } else {
    return {
      host: process.env.REMOTE_DB_HOST,
      port: Number(process.env.REMOTE_DB_PORT || '5432'),
      database: process.env.REMOTE_DB_NAME || 'postgres',
      user: process.env.REMOTE_DB_USER || 'postgres',
      password: process.env.REMOTE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
    };
  }
}

async function getAdjustments() {
  const client = new pg.Client(getDbConfig('local'));
  const adjustmentsToInsert = [];
  try {
    await client.connect();
    const { rows: dbLoans } = await client.query(`
      SELECT l.id, l.total_amount, l.collector_id,
             COALESCE(SUM(p.amount), 0) as paid_amount,
             (l.total_amount - COALESCE(SUM(p.amount), 0)) as calculated_balance
      FROM public.app_loans l
      LEFT JOIN public.app_payments p ON l.id::text = p.loan_id::text
      GROUP BY l.id, l.total_amount, l.collector_id
    `);

    const dbLoanMap = new Map();
    dbLoans.forEach(l => {
      dbLoanMap.set(l.id, {
        total_amount: Number(l.total_amount),
        calculated_balance: Number(l.calculated_balance),
        collector_id: l.collector_id
      });
    });

    const loans = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'loans.json'), 'utf-8'));
    
    for (const l of loans) {
      const expectedBalance = l.total_loan_balance || 0;
      const uuid = deterministicUUID(`loan-may30-${l.ref_id}`);
      const dbInfo = dbLoanMap.get(uuid);
      
      if (!dbInfo) continue;

      const diff = dbInfo.calculated_balance - expectedBalance;
      if (diff > 0.02) {
        const adjustmentAmount = diff;
        const adjId = deterministicUUID(`adjustment-may30-${l.ref_id}`);
        adjustmentsToInsert.push({
          id: adjId,
          loan_id: uuid,
          amount: adjustmentAmount,
          payment_date: '2026-05-30',
          notes: 'System Auto-Adjustment to match legacy Excel balance',
          collector_id: dbInfo.collector_id,
        });
        console.log(`⚠️ Expected adjustment for ${l.ref_id}: Excel=₱${expectedBalance}, DB=₱${dbInfo.calculated_balance} -> Payment of ₱${adjustmentAmount}`);
      }
    }
  } finally {
    await client.end();
  }
  return adjustmentsToInsert;
}

async function insertToTarget(target, adjustmentsToInsert) {
  if (adjustmentsToInsert.length === 0) return;
  console.log(`\nInserting ${adjustmentsToInsert.length} adjustments into ${target.toUpperCase()}...`);
  
  if (target === 'local') {
    const client = new pg.Client(getDbConfig('local'));
    await client.connect();
    try {
      for (let i = 0; i < adjustmentsToInsert.length; i += 500) {
        const batch = adjustmentsToInsert.slice(i, i + 500);
        let values = [];
        let placeholders = [];
        let paramIdx = 1;
        for (const p of batch) {
          placeholders.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
          values.push(p.id, p.loan_id, p.amount, p.payment_date, p.notes, p.collector_id);
        }
        await client.query(`
          INSERT INTO public.app_payments (id, loan_id, amount, payment_date, notes, collector_id)
          VALUES ${placeholders.join(', ')}
          ON CONFLICT (id) DO NOTHING
        `, values);
      }
      console.log(`✅ Successfully inserted into local.`);
    } finally {
      await client.end();
    }
  } else {
    const url = process.env.REMOTE_SUPABASE_URL || 'https://qtkdnpbbukjamqgvbaeh.supabase.co';
    const key = process.env.REMOTE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(url, key);
    for (let i = 0; i < adjustmentsToInsert.length; i += 500) {
      const batch = adjustmentsToInsert.slice(i, i + 500);
      const { error } = await supabase.from('app_payments').upsert(batch, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
    }
    console.log(`✅ Successfully inserted into remote.`);
  }
}

async function run() {
  // We need to re-clear and re-migrate local so we can get the unadjusted calculated balances
  console.log('Fetching adjustments...');
  const adjustments = await getAdjustments();
  if (adjustments.length > 0) {
    await insertToTarget('local', adjustments);
    await insertToTarget('remote', adjustments);
  } else {
    console.log('No adjustments needed. (You probably already applied them).');
  }
}

run();
