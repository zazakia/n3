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

async function reconcile(target) {
  console.log(`\n=================================================`);
  console.log(`Reconciling balances for target: ${target.toUpperCase()}`);
  console.log(`=================================================`);

  let dbLoans = [];
  if (target === 'local') {
    const client = new pg.Client(getDbConfig(target));
    try {
      await client.connect();
      const { rows } = await client.query(`
        SELECT l.id, l.total_amount, 
               COALESCE(SUM(p.amount), 0) as paid_amount,
               (l.total_amount - COALESCE(SUM(p.amount), 0)) as calculated_balance
        FROM public.app_loans l
        LEFT JOIN public.app_payments p ON l.id::text = p.loan_id::text
        GROUP BY l.id
      `);
      dbLoans = rows;
    } finally {
      await client.end();
    }
  } else {
    // For remote, fetch all loans and payments via REST to avoid Postgres direct SSL issues
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.REMOTE_SUPABASE_URL || 'https://qtkdnpbbukjamqgvbaeh.supabase.co';
    const key = process.env.REMOTE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(url, key);
    
    console.log('  Fetching loans from remote...');
    const { data: loansData, error: loansErr } = await supabase.from('app_loans').select('id, total_amount');
    if (loansErr) throw loansErr;
    
    console.log('  Fetching payments from remote...');
    let paymentsData = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from('app_payments').select('loan_id, amount').range(from, from + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      paymentsData = paymentsData.concat(data);
      from += 1000;
      process.stdout.write(`    fetched ${paymentsData.length} payments\r`);
    }
    console.log('\n  Aggregating remote data...');
    
    const paymentSums = {};
    paymentsData.forEach(p => {
      if (!paymentSums[p.loan_id]) paymentSums[p.loan_id] = 0;
      paymentSums[p.loan_id] += Number(p.amount);
    });
    
    dbLoans = loansData.map(l => {
      const paid = paymentSums[l.id] || 0;
      return {
        id: l.id,
        total_amount: l.total_amount,
        paid_amount: paid,
        calculated_balance: l.total_amount - paid
      };
    });
  }

  const dbLoanMap = new Map();
  dbLoans.forEach(l => {
    dbLoanMap.set(l.id, {
      total_amount: Number(l.total_amount),
      paid_amount: Number(l.paid_amount),
      calculated_balance: Number(l.calculated_balance)
    });
  });

  const loans = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'loans.json'), 'utf-8'));
  let matches = 0;
  let mismatches = 0;
  let notFound = 0;
  
  let totalExcelBalance = 0;
  let totalDbBalance = 0;

  for (const l of loans) {
    const expectedBalance = l.total_loan_balance || 0;
    totalExcelBalance += expectedBalance;
    
    const uuid = deterministicUUID(`loan-may30-${l.ref_id}`);
    const dbInfo = dbLoanMap.get(uuid);
    
    if (!dbInfo) {
      console.error(`❌ Loan not found in DB: ref=${l.ref_id} (Expected Balance: ${expectedBalance})`);
      notFound++;
      continue;
    }
    
    totalDbBalance += dbInfo.calculated_balance;

    const diff = Math.abs(dbInfo.calculated_balance - expectedBalance);
    if (diff > 0.02) {
      console.error(`⚠️ Mismatch for ${l.ref_id}: Excel expected ${expectedBalance}, DB calculated ${dbInfo.calculated_balance} (Diff: ${diff}) (Paid: ${dbInfo.paid_amount})`);
      mismatches++;
    } else {
      matches++;
    }
  }
  
  console.log(`\nReconciliation Summary for ${target}:`);
  console.log(`Total loans in Excel:     ${loans.length}`);
  console.log(`Matched exactly:          ${matches}`);
  console.log(`Mismatches:               ${mismatches}`);
  console.log(`Not found in DB:          ${notFound}`);
  console.log(`---`);
  console.log(`Total Balance (Excel):    ₱${totalExcelBalance.toLocaleString()}`);
  console.log(`Total Balance (DB):       ₱${totalDbBalance.toLocaleString()}`);
  console.log(`Total Balance Diff:       ₱${Math.abs(totalExcelBalance - totalDbBalance).toLocaleString()}`);
}

async function run() {
  await reconcile('local');
  await reconcile('remote');
}

run();
