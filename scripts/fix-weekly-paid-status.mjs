/**
 * check-weekly-paid-status.mjs
 * Verify status of weekly loans - how many should be paid vs active based on payment totals
 */
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new pg.Client({
  host: process.env.SUPABASE_DB_HOST || '127.0.0.1',
  port: Number(process.env.SUPABASE_DB_PORT || '55322'),
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER || 'postgres',
  password: process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD || 'postgres',
});
await client.connect();

// Count loans where paid >= total_amount (should be marked paid)
const q1 = await client.query(`
  SELECT
    l.id, b.full_name, l.loan_number, l.principal_amount, l.total_amount, l.status,
    COALESCE(SUM(p.amount::numeric), 0) as total_paid,
    GREATEST(0, l.total_amount::numeric - COALESCE(SUM(p.amount::numeric), 0)) as balance
  FROM app_loans l
  JOIN app_borrowers b ON b.id::text = l.borrower_id::text
  LEFT JOIN app_payments p ON l.id::text = p.loan_id::text AND p.deleted_at IS NULL
  WHERE l.loan_number LIKE 'LN-WKLY-%' AND l.deleted_at IS NULL
  GROUP BY l.id, b.full_name, l.loan_number, l.principal_amount, l.total_amount, l.status
  HAVING COALESCE(SUM(p.amount::numeric), 0) >= l.total_amount::numeric AND l.total_amount::numeric > 0
`);
console.log(`Loans where total_paid >= total_amount (should be 'paid'): ${q1.rows.length}`);

// Status distribution
const q2 = await client.query(`
  SELECT status, COUNT(*) as count
  FROM app_loans WHERE loan_number LIKE 'LN-WKLY-%' AND deleted_at IS NULL
  GROUP BY status
`);
console.log('\nCurrent status distribution:');
q2.rows.forEach(r => console.log(`  ${r.status}: ${r.count}`));

// Sample loans that should be paid
if (q1.rows.length > 0) {
  console.log('\nSample loans that should be paid (first 10):');
  q1.rows.slice(0, 10).forEach(r => {
    console.log(`  ${r.full_name.padEnd(35)} ${r.loan_number} principal=₱${r.principal_amount} total=₱${r.total_amount} paid=₱${r.total_paid} status=${r.status}`);
  });

  // Fix: update these to paid status
  console.log('\nFixing status of fully paid loans...');
  const ids = q1.rows.map(r => r.id);
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(',');
    await client.query(`UPDATE public.app_loans SET status='paid', updated_at=NOW() WHERE id IN (${placeholders})`, chunk);
  }
  console.log(`✅ Updated ${ids.length} loans to 'paid' status`);
}

// Final check
const q3 = await client.query(`
  SELECT status, COUNT(*) as count
  FROM app_loans WHERE loan_number LIKE 'LN-WKLY-%' AND deleted_at IS NULL
  GROUP BY status
`);
console.log('\nFinal status distribution after fix:');
q3.rows.forEach(r => console.log(`  ${r.status}: ${r.count}`));

await client.end();
