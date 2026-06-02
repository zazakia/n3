import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'migration-data');

function deterministicUUID(seed) {
  const hash = crypto.createHash('md5').update(seed).digest('hex');
  return [
    hash.slice(0, 8), hash.slice(8, 12), '4' + hash.slice(13, 16),
    '8' + hash.slice(17, 20), hash.slice(20, 32),
  ].join('-');
}

const url = process.env.REMOTE_SUPABASE_URL || 'https://qtkdnpbbukjamqgvbaeh.supabase.co';
const key = process.env.REMOTE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!key) {
  console.error('❌ Missing REMOTE_SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key);

async function migrateRemoteREST() {
  console.log('☁️ Migrating to REMOTE via REST API...');

  const borrowers = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'borrowers.json'), 'utf-8'));
  const loans = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'loans.json'), 'utf-8'));
  const payments = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'payments.json'), 'utf-8'));

  // 1. COLLECTORS
  console.log('\n📋 Step 1: Collectors...');
  const { data: existingCollectors } = await supabase.from('app_collectors').select('id, full_name');
  const collectorMap = {};
  for (const c of existingCollectors || []) {
    collectorMap[c.full_name.toLowerCase()] = c.id;
  }

  const neededCollectors = [...new Set(borrowers.map(b => b.collector).filter(Boolean))];
  for (const name of neededCollectors) {
    if (!collectorMap[name.toLowerCase()]) {
      const id = deterministicUUID(`collector-${name}`);
      await supabase.from('app_collectors').upsert({ id, full_name: name, is_active: true });
      collectorMap[name.toLowerCase()] = id;
      console.log(`  ➕ Created collector: ${name}`);
    }
  }

  // 2. BORROWERS
  console.log(`\n📋 Step 2: ${borrowers.length} Borrowers...`);
  const borrowerIdMap = {};
  const bRows = borrowers.map(b => {
    const uuid = deterministicUUID(`borrower-may30-${b.ref_id}`);
    borrowerIdMap[b.ref_id] = uuid;
    return {
      id: uuid,
      full_name: b.full_name,
      first_name: b.first_name || null,
      last_name: b.last_name || null,
      address: b.address || null,
      phone: b.phone || null,
      business: b.business || null,
      co_maker_name: b.co_maker_name || null,
      collector_id: collectorMap[(b.collector || '').toLowerCase()] || null,
      group: 'Daily'
    };
  });
  
  for (let i = 0; i < bRows.length; i += 500) {
    const { error } = await supabase.from('app_borrowers').upsert(bRows.slice(i, i + 500), { onConflict: 'id' });
    if (error) throw error;
    process.stdout.write(`  Inserted ${Math.min(i + 500, bRows.length)}/${bRows.length}\r`);
  }
  console.log('\n  ✅ Borrowers done.');

  // 3. LOANS
  console.log(`\n📋 Step 3: ${loans.length} Loans...`);
  const loanIdMap = {};
  let loanNum = 0;
  for (const l of loans) {
    loanIdMap[l.ref_id] = deterministicUUID(`loan-may30-${l.ref_id}`);
  }

  const lRows = loans.map(l => {
    loanNum++;
    return {
      id: loanIdMap[l.ref_id],
      borrower_id: borrowerIdMap[l.borrower_ref],
      loan_number: `LN-2025-MAY30-${String(loanNum).padStart(4, '0')}`,
      principal_amount: l.loan_amount || 0,
      interest_rate: l.loan_amount > 0 ? ((l.interest || 0) / l.loan_amount) * 100 : 0,
      interest_type: 'flat',
      term: l.days || 40,
      term_unit: 'days',
      frequency: 'daily',
      total_amount: l.total_loan || 0,
      installment_amount: l.daily_installment || 0,
      insurance_amount: l.insurance || 0,
      deducted_amount: (l.interest || 0) + (l.insurance || 0),
      release_date: l.release_date || null,
      maturity_date: l.end_date || null,
      collector_id: collectorMap[(l.collector || '').toLowerCase()] || null,
      status: l.status === 'paid' ? 'paid' : (l.loan_amount === 0 ? 'paid' : 'active'),
      batch: l.batch || null,
      cycle: l.cycle || null,
      previous_loan_id: l.previous_loan_ref ? loanIdMap[l.previous_loan_ref] || null : null,
    };
  });

  for (let i = 0; i < lRows.length; i += 500) {
    const { error } = await supabase.from('app_loans').upsert(lRows.slice(i, i + 500), { onConflict: 'id' });
    if (error) throw error;
    process.stdout.write(`  Inserted ${Math.min(i + 500, lRows.length)}/${lRows.length}\r`);
  }
  console.log('\n  ✅ Loans done.');

  // 4. PAYMENTS
  console.log(`\n📋 Step 4: ${payments.length} Payments...`);
  const pRows = payments.map(p => ({
    id: deterministicUUID(`payment-may30-${p.loan_ref}-${p.payment_date}-${p.amount}`),
    loan_id: loanIdMap[p.loan_ref],
    amount: p.amount || 0,
    payment_date: p.payment_date || null,
    collector_id: collectorMap[(p.collector || '').toLowerCase()] || null,
  })).filter(p => p.loan_id);

  for (let i = 0; i < pRows.length; i += 500) {
    const { error } = await supabase.from('app_payments').upsert(pRows.slice(i, i + 500), { onConflict: 'id' });
    if (error) throw error;
    process.stdout.write(`  Inserted ${Math.min(i + 500, pRows.length)}/${pRows.length}\r`);
  }
  console.log('\n  ✅ Payments done.');

  // 5. SCHEDULES
  console.log('\n📋 Step 5: Payment Schedules...');
  const activeLoans = loans.filter(l => l.status === 'active' && l.loan_amount > 0);
  const sRows = [];
  for (const l of activeLoans) {
    const loanId = loanIdMap[l.ref_id];
    const term = l.days || 40;
    const dailyAmount = l.daily_installment || 0;
    const releaseDate = l.release_date;
    if (!releaseDate || !dailyAmount) continue;
    for (let day = 1; day <= term; day++) {
      const dueDate = new Date(releaseDate);
      dueDate.setDate(dueDate.getDate() + day);
      if (dueDate.getDay() === 0) continue;
      sRows.push({
        id: deterministicUUID(`schedule-may30-${l.ref_id}-day${day}`),
        loan_id: loanId,
        scheduled_amount: dailyAmount,
        due_date: dueDate.toISOString().split('T')[0],
        status: 'pending'
      });
    }
  }

  for (let i = 0; i < sRows.length; i += 500) {
    const { error } = await supabase.from('app_payment_schedules').upsert(sRows.slice(i, i + 500), { onConflict: 'id' });
    if (error) throw error;
    process.stdout.write(`  Inserted ${Math.min(i + 500, sRows.length)}/${sRows.length}\r`);
  }
  console.log(`\n  ✅ ${sRows.length} Schedules done.`);

  console.log('\n✅ Remote Migration via REST completed successfully!');
}

migrateRemoteREST().catch(e => console.error(e));
