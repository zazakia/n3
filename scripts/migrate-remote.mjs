import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

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

function loadJSON(filename) {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.error(`❌ Missing ${filepath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

async function migrate() {
  const url = process.env.REMOTE_SUPABASE_URL || 'https://qtkdnpbbukjamqgvbaeh.supabase.co';
  const key = process.env.REMOTE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error('❌ Missing REMOTE_SUPABASE_SERVICE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  console.log(`✅ Connected to ${url}`);

  const borrowers = loadJSON('borrowers.json');
  const loans = loadJSON('loans.json');
  const payments = loadJSON('payments.json');

  // Step 1: Collectors
  console.log('\n📋 Step 1: Collectors...');
  const { data: existingCollectors } = await supabase.from('app_collectors').select('id, full_name');
  const collectorMap = {};
  existingCollectors.forEach(c => collectorMap[c.full_name.toLowerCase()] = c.id);

  const neededCollectors = [...new Set(borrowers.map(b => b.collector).filter(Boolean))];
  for (const name of neededCollectors) {
    if (!collectorMap[name.toLowerCase()]) {
      const id = deterministicUUID(`collector-${name}`);
      await supabase.from('app_collectors').insert({ id, full_name: name, is_active: true });
      collectorMap[name.toLowerCase()] = id;
      console.log(`  ➕ Created collector: ${name}`);
    }
  }

  // Step 2: Borrowers
  console.log(`\n📋 Step 2: Borrowers (${borrowers.length})...`);
  const borrowerIdMap = {};
  const borrowerRows = borrowers.map(b => {
    const id = deterministicUUID(`borrower-may30-${b.ref_id}`);
    borrowerIdMap[b.ref_id] = id;
    return {
      id,
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
  
  for (let i=0; i<borrowerRows.length; i+=500) {
    await supabase.from('app_borrowers').upsert(borrowerRows.slice(i, i+500), { onConflict: 'id', ignoreDuplicates: true });
    process.stdout.write(`  Inserted ${Math.min(i+500, borrowerRows.length)}\r`);
  }
  console.log(`  ✅ Borrowers inserted`);

  // Step 3: Loans
  console.log(`\n📋 Step 3: Loans (${loans.length})...`);
  const loanIdMap = {};
  loans.forEach(l => loanIdMap[l.ref_id] = deterministicUUID(`loan-may30-${l.ref_id}`));

  let loanNum = 0;
  const loanRows = loans.map(l => {
    loanNum++;
    const status = l.status === 'paid' ? 'paid' : (l.loan_amount === 0 ? 'paid' : 'active');
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
      status,
      batch: l.batch || null,
      cycle: l.cycle || null,
      previous_loan_id: l.previous_loan_ref ? loanIdMap[l.previous_loan_ref] : null
    };
  });

  for (let i=0; i<loanRows.length; i+=500) {
    await supabase.from('app_loans').upsert(loanRows.slice(i, i+500), { onConflict: 'id', ignoreDuplicates: true });
    process.stdout.write(`  Inserted ${Math.min(i+500, loanRows.length)}\r`);
  }
  console.log(`  ✅ Loans inserted`);

  // Step 4: Payments
  console.log(`\n📋 Step 4: Payments (${payments.length})...`);
  const paymentRows = payments.map(p => ({
    id: deterministicUUID(`payment-may30-${p.loan_ref}-${p.payment_date}-${p.amount}`),
    loan_id: loanIdMap[p.loan_ref],
    amount: p.amount || 0,
    payment_date: p.payment_date || null,
    collector_id: collectorMap[(p.collector || '').toLowerCase()] || null
  })).filter(p => p.loan_id);

  for (let i=0; i<paymentRows.length; i+=1000) {
    await supabase.from('app_payments').upsert(paymentRows.slice(i, i+1000), { onConflict: 'id', ignoreDuplicates: true });
    process.stdout.write(`  Inserted ${Math.min(i+1000, paymentRows.length)}\r`);
  }
  console.log(`  ✅ Payments inserted`);

  // Step 5: Schedules
  const activeLoans = loans.filter(l => l.status === 'active' && l.loan_amount > 0);
  console.log(`\n📋 Step 5: Schedules for ${activeLoans.length} active loans...`);
  
  const schedRows = [];
  activeLoans.forEach(l => {
    const term = l.days || 40;
    const releaseDate = l.release_date;
    if (!releaseDate || !(l.daily_installment)) return;

    for (let day=1; day<=term; day++) {
      const dueDate = new Date(releaseDate);
      dueDate.setDate(dueDate.getDate() + day);
      if (dueDate.getDay() === 0) continue;

      schedRows.push({
        id: deterministicUUID(`schedule-may30-${l.ref_id}-day${day}`),
        loan_id: loanIdMap[l.ref_id],
        scheduled_amount: l.daily_installment || 0,
        due_date: dueDate.toISOString().split('T')[0],
        status: 'pending'
      });
    }
  });

  for (let i=0; i<schedRows.length; i+=1000) {
    await supabase.from('app_payment_schedules').upsert(schedRows.slice(i, i+1000), { onConflict: 'id', ignoreDuplicates: true });
    process.stdout.write(`  Inserted ${Math.min(i+1000, schedRows.length)}\r`);
  }
  console.log(`  ✅ ${schedRows.length} Schedules inserted`);
  console.log('\n✅ Remote Migration Complete!');
}

migrate().catch(e => { console.error('Error:', e); process.exit(1); });
