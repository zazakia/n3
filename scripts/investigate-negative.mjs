/**
 * investigate-negative-balances.mjs
 * Look at the 10 negative-balance weekly loans in detail
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

  const { rows } = await client.query(`
    SELECT b.full_name, l.loan_number, l.principal_amount, l.total_amount,
           l.installment_amount, l.term, l.term_unit, l.status,
           COALESCE(SUM(p.amount::numeric), 0) as total_paid,
           l.total_amount::numeric - COALESCE(SUM(p.amount::numeric), 0) as balance,
           COUNT(p.id) as payment_count
    FROM app_loans l
    JOIN app_borrowers b ON b.id::text = l.borrower_id::text
    LEFT JOIN app_payments p ON l.id::text = p.loan_id::text AND p.deleted_at IS NULL
    WHERE l.loan_number LIKE 'LN-WKLY-%' AND l.deleted_at IS NULL
    GROUP BY b.full_name, l.loan_number, l.principal_amount, l.total_amount, l.installment_amount, l.term, l.term_unit, l.status
    HAVING l.total_amount::numeric - COALESCE(SUM(p.amount::numeric), 0) < -1
    ORDER BY balance
    LIMIT 20
  `);

  console.log('=== NEGATIVE BALANCE WEEKLY LOANS ===\n');
  rows.forEach(r => {
    console.log(`${r.full_name} [${r.loan_number}]`);
    console.log(`  Principal: ₱${r.principal_amount}  |  Portfolio: ₱${r.total_amount}  |  Installment: ₱${r.installment_amount}/wk  |  Term: ${r.term} ${r.term_unit}`);
    console.log(`  Total Paid: ₱${r.total_paid}  |  Balance: ₱${r.balance}  |  Payments: ${r.payment_count}  |  Status: ${r.status}`);
    // Explain: if portfolio = installment * term, but payments > portfolio, it was overpaid
    const expectedPortfolio = Number(r.installment_amount) * Number(r.term);
    console.log(`  Expected portfolio (installment*term): ₱${expectedPortfolio}  |  Actual: ₱${r.total_amount}`);
    console.log();
  });

  // Check: in the Excel, is total_amount = portfolio actually = installment * num_weeks?
  // If portfolio=312 but 24 payments of 200/wk = 4800, the portfolio is wrong in Excel
  // The "total_amount" in the weekly script is column 14 = "Total Loan Payments (Portfolio)"
  // This is a COLUMN in the Excel that might be wrong/partial
  console.log('=== ROOT CAUSE ANALYSIS ===');
  console.log('The "total_amount" (portfolio) stored in DB comes from Excel column 14.');
  console.log('For these loans, total_paid > total_amount, meaning:');
  console.log('  - Either the payments were correct and the portfolio column was wrong in Excel');
  console.log('  - Or the weekly payment collection sums include deposits/other amounts');
  console.log();
  console.log('The migrate-weekly.js script stores col[14] as totalAmount (portfolio)');
  console.log('and sums col[colStart+3] (totalPaid per week) for all 24 payment columns.');
  console.log();
  console.log('Key question: is col[14] the TOTAL REPAYABLE or just partial data?');

  await client.end();
}
run().catch(err => { console.error(err); process.exit(1); });
