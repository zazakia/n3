/**
 * verify-weekly-db-integrity.mjs
 * Deep DB integrity check for weekly migrated data
 */

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
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   WEEKLY DB INTEGRITY CHECK                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // 1. Borrower counts by group
  console.log('\n── 1. Borrowers by Group (Weekly) ──────────────────────────────');
  const q1 = await client.query(`
    SELECT b."group", COUNT(DISTINCT b.id) as borrowers, COUNT(l.id) as loans
    FROM app_borrowers b
    JOIN app_loans l ON b.id::text = l.borrower_id::text
    WHERE l.loan_number LIKE 'LN-WKLY-%' AND l.deleted_at IS NULL AND b.deleted_at IS NULL
    GROUP BY b."group"
    ORDER BY b."group"
  `);
  q1.rows.forEach(r => console.log(`  ${r.group?.padEnd(35)} borrowers=${r.borrowers}, loans=${r.loans}`));

  // 2. Zero-principal active loans (phantom check)
  console.log('\n── 2. Phantom Zero-Principal Active Loans Check ─────────────────');
  const q2 = await client.query(`
    SELECT COUNT(*) as count FROM app_loans
    WHERE principal_amount = 0 AND status = 'active' AND deleted_at IS NULL
      AND loan_number LIKE 'LN-WKLY-%'
  `);
  const phantomCount = Number(q2.rows[0].count);
  console.log(`  Zero-principal active WKLY loans: ${phantomCount} ${phantomCount === 0 ? '✅' : '❌ PROBLEM!'}`);

  // 3. Loans with negative or impossible balances
  console.log('\n── 3. Impossible Balance Check ──────────────────────────────────');
  const q3 = await client.query(`
    SELECT b.full_name, l.loan_number, l.principal_amount, l.total_amount,
           COALESCE(SUM(p.amount::numeric), 0) as total_paid,
           l.total_amount::numeric - COALESCE(SUM(p.amount::numeric), 0) as balance
    FROM app_loans l
    JOIN app_borrowers b ON b.id::text = l.borrower_id::text
    LEFT JOIN app_payments p ON l.id::text = p.loan_id::text AND p.deleted_at IS NULL
    WHERE l.loan_number LIKE 'LN-WKLY-%' AND l.deleted_at IS NULL
    GROUP BY b.full_name, l.loan_number, l.principal_amount, l.total_amount
    HAVING l.total_amount::numeric - COALESCE(SUM(p.amount::numeric), 0) < -1
    ORDER BY balance
    LIMIT 10
  `);
  if (q3.rows.length === 0) {
    console.log('  No loans with negative balance ✅');
  } else {
    console.log(`  ❌ ${q3.rows.length} loans with negative balance:`);
    q3.rows.forEach(r => console.log(`    ${r.full_name}: ${r.loan_number} balance=₱${Number(r.balance).toFixed(2)}`));
  }

  // 4. Active loans with overpayment
  console.log('\n── 4. Overpayment Check (active loans fully paid) ───────────────');
  const q4 = await client.query(`
    SELECT COUNT(*) as count FROM (
      SELECT l.id, l.total_amount::numeric as total_amount, COALESCE(SUM(p.amount::numeric), 0) as paid
      FROM app_loans l
      LEFT JOIN app_payments p ON l.id::text = p.loan_id::text AND p.deleted_at IS NULL
      WHERE l.loan_number LIKE 'LN-WKLY-%' AND l.status = 'active' AND l.deleted_at IS NULL
      GROUP BY l.id, l.total_amount
      HAVING COALESCE(SUM(p.amount::numeric), 0) >= l.total_amount::numeric AND l.total_amount::numeric > 0
    ) sub
  `);
  const overpaidCount = Number(q4.rows[0].count);
  console.log(`  Active loans that are fully paid: ${overpaidCount} ${overpaidCount === 0 ? '✅' : '⚠️  Should be marked paid'}`);

  // 5. Payments integrity (no orphan payments)
  console.log('\n── 5. Payment Integrity (no orphaned payments) ──────────────────');
  const q5 = await client.query(`
    SELECT COUNT(*) as count FROM app_payments p
    WHERE NOT EXISTS (SELECT 1 FROM app_loans l WHERE l.id::text = p.loan_id::text)
      AND p.deleted_at IS NULL
  `);
  const orphanCount = Number(q5.rows[0].count);
  console.log(`  Orphaned payments: ${orphanCount} ${orphanCount === 0 ? '✅' : '❌'}`);

  // 6. Savings transactions count
  console.log('\n── 6. Savings Transactions (CBU) ────────────────────────────────');
  const q6 = await client.query(`
    SELECT COUNT(*) as count, SUM(amount::numeric) as total
    FROM app_savings_transactions
    WHERE deleted_at IS NULL
  `);
  console.log(`  Total savings transactions: ${q6.rows[0].count}`);
  console.log(`  Total savings amount: ₱${Number(q6.rows[0].total || 0).toLocaleString()}`);

  // 7. Sample active weekly borrowers with balances
  console.log('\n── 7. Sample Active Weekly Borrowers ────────────────────────────');
  const q7 = await client.query(`
    SELECT b.full_name, b."group", l.loan_number, l.principal_amount, l.total_amount,
           COALESCE(SUM(p.amount::numeric), 0) as total_paid,
           GREATEST(0, l.total_amount::numeric - COALESCE(SUM(p.amount::numeric), 0)) as balance
    FROM app_loans l
    JOIN app_borrowers b ON b.id::text = l.borrower_id::text
    LEFT JOIN app_payments p ON l.id::text = p.loan_id::text AND p.deleted_at IS NULL
    WHERE l.loan_number LIKE 'LN-WKLY-%' AND l.status = 'active' AND l.deleted_at IS NULL
    GROUP BY b.full_name, b."group", l.loan_number, l.principal_amount, l.total_amount
    ORDER BY balance DESC
    LIMIT 10
  `);
  if (q7.rows.length === 0) {
    console.log('  No active weekly loans found');
  } else {
    q7.rows.forEach(r => {
      console.log(`  ${r.full_name.padEnd(35)} ${r.loan_number.padEnd(15)} ₱${Number(r.principal_amount).toLocaleString().padEnd(8)} balance=₱${Number(r.balance).toFixed(2)}`);
    });
  }

  // 8. Check that specific phantom names are gone
  console.log('\n── 8. Phantom Group Names Check ─────────────────────────────────');
  const phantomNames = ['Damulaan', 'FRIDAY Meeting', 'Palanas', 'Maybog', 'Balugo', 'Cambalading', 'GK Village', 'Tinag-an'];
  const q8 = await client.query(`
    SELECT b.full_name, l.status, l.principal_amount, l.loan_number
    FROM app_borrowers b
    JOIN app_loans l ON b.id::text = l.borrower_id::text
    WHERE b.full_name = ANY($1) AND l.deleted_at IS NULL AND l.status = 'active' AND l.principal_amount = 0
  `, [phantomNames]);
  if (q8.rows.length === 0) {
    console.log('  No phantom group-name active zero-balance records found ✅');
  } else {
    console.log(`  ❌ ${q8.rows.length} phantom records still exist:`);
    q8.rows.forEach(r => console.log(`    ${r.full_name}: ${r.loan_number} ₱${r.principal_amount}`));
  }

  // 9. Overall weekly stats
  console.log('\n── 9. Overall Weekly Stats ──────────────────────────────────────');
  const q9 = await client.query(`
    SELECT
      COUNT(DISTINCT b.id) as unique_borrowers,
      COUNT(DISTINCT l.id) as total_loans,
      COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'active') as active_loans,
      COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'paid') as paid_loans,
      SUM(l.principal_amount::numeric) as total_principal,
      SUM(l.total_amount::numeric) as total_portfolio,
      COUNT(DISTINCT p.id) as total_payments,
      COALESCE(SUM(p.amount::numeric), 0) as total_paid
    FROM app_borrowers b
    JOIN app_loans l ON b.id::text = l.borrower_id::text
    LEFT JOIN app_payments p ON l.id::text = p.loan_id::text AND p.deleted_at IS NULL
    WHERE l.loan_number LIKE 'LN-WKLY-%' AND l.deleted_at IS NULL AND b.deleted_at IS NULL
  `);
  const s = q9.rows[0];
  console.log(`  Unique borrowers:   ${s.unique_borrowers}`);
  console.log(`  Total loans:        ${s.total_loans} (active=${s.active_loans}, paid=${s.paid_loans})`);
  console.log(`  Total principal:    ₱${Number(s.total_principal || 0).toLocaleString()}`);
  console.log(`  Total portfolio:    ₱${Number(s.total_portfolio || 0).toLocaleString()}`);
  console.log(`  Total payments:     ${s.total_payments} records`);
  console.log(`  Total paid amount:  ₱${Number(s.total_paid || 0).toLocaleString()}`);

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   INTEGRITY CHECK COMPLETE                                  ║');
  const allOK = phantomCount === 0 && q3.rows.length === 0 && orphanCount === 0 && q8.rows.length === 0;
  console.log(`║   Status: ${allOK ? '✅ ALL CHECKS PASSED' : '❌ ISSUES FOUND — see above'}${' '.repeat(allOK ? 32 : 28)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  await client.end();
}
run().catch(err => { console.error('💥 Fatal:', err.message); process.exit(1); });
