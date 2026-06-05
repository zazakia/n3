import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qtkdnpbbukjamqgvbaeh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YXjolA9mlvLplSA3pY-2FA_b9sJ0PO6';
const DATA_DIR = path.resolve('scripts', 'migration-data');

function loadJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

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

async function fetchAll(supabase, table, select, order = 'id') {
  const rows = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(order, { ascending: true })
      .range(from, to);

    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

function sumBy(rows, key, valueKey) {
  const totals = new Map();
  for (const row of rows) {
    totals.set(row[key], (totals.get(row[key]) || 0) + Number(row[valueKey] || 0));
  }
  return totals;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const excelLoans = loadJSON('loans.json');
const excelPayments = loadJSON('payments.json');
const excelLoanById = new Map();
const expectedMay30ByLoanNumber = new Map();

for (let i = 0; i < excelLoans.length; i++) {
  const loan = excelLoans[i];
  const id = deterministicUUID(`loan-may30-${loan.ref_id}`);
  const loanNumber = `LN-2025-MAY30-${String(i + 1).padStart(4, '0')}`;
  excelLoanById.set(id, { ...loan, id, loan_number: loanNumber });
  expectedMay30ByLoanNumber.set(loanNumber, { ...loan, id, loan_number: loanNumber });
}

const prodLoans = await fetchAll(
  supabase,
  'app_loans',
  'id,borrower_id,loan_number,principal_amount,total_amount,insurance_amount,deducted_amount,previous_loan_id,release_date,maturity_date,status,cycle,is_reloan,deleted_at',
  'loan_number'
);
const prodBorrowers = await fetchAll(supabase, 'app_borrowers', 'id,full_name,deleted_at', 'full_name');
const prodPayments = await fetchAll(supabase, 'app_payments', 'id,loan_id,amount,payment_date,notes,deleted_at', 'loan_id');

const borrowerById = new Map(prodBorrowers.map((b) => [b.id, b]));
const paymentsByLoanId = sumBy(prodPayments.filter((p) => !p.deleted_at), 'loan_id', 'amount');

const may30ProdLoans = prodLoans.filter((loan) => loan.loan_number?.startsWith('LN-2025-MAY30-') && !loan.deleted_at);
const nonZeroMay30 = may30ProdLoans.filter((loan) => Number(loan.deducted_amount || 0) !== 0);
const matchedMay30 = may30ProdLoans.filter((loan) => expectedMay30ByLoanNumber.has(loan.loan_number));
const missingInProd = [...expectedMay30ByLoanNumber.values()].filter(
  (loan) => !may30ProdLoans.some((prod) => prod.loan_number === loan.loan_number)
);

const fieldMismatches = [];
for (const prod of matchedMay30) {
  const expected = expectedMay30ByLoanNumber.get(prod.loan_number);
  const checks = [
    ['principal_amount', prod.principal_amount, expected.loan_amount],
    ['total_amount', prod.total_amount, expected.total_loan],
    ['insurance_amount', prod.insurance_amount, expected.insurance],
    ['release_date', String(prod.release_date || '').slice(0, 10), expected.release_date],
    ['maturity_date', String(prod.maturity_date || '').slice(0, 10), expected.end_date],
  ];

  for (const [field, actual, wanted] of checks) {
    if (String(moneyIfNumber(actual)) !== String(moneyIfNumber(wanted))) {
      fieldMismatches.push({
        loan_number: prod.loan_number,
        borrower: borrowerById.get(prod.borrower_id)?.full_name,
        field,
        actual,
        expected: wanted,
      });
    }
  }
}

function moneyIfNumber(value) {
  if (typeof value === 'number') return money(value);
  if (typeof value === 'string' && value !== '' && !Number.isNaN(Number(value))) return money(Number(value));
  return value ?? '';
}

const deductionMismatches = matchedMay30
  .filter((prod) => Number(prod.deducted_amount || 0) !== 0)
  .map((prod) => {
    const expected = expectedMay30ByLoanNumber.get(prod.loan_number);
    const borrower = borrowerById.get(prod.borrower_id)?.full_name;
    const previous = prod.previous_loan_id ? prodLoans.find((loan) => loan.id === prod.previous_loan_id) : null;
    return {
      loan_number: prod.loan_number,
      borrower,
      actual_deducted_amount: Number(prod.deducted_amount || 0),
      expected_migrated_deducted_amount: 0,
      excel_interest: expected.interest,
      excel_insurance: expected.insurance,
      excel_interest_plus_insurance: Number(expected.interest || 0) + Number(expected.insurance || 0),
      excel_net_loan: expected.net_loan,
      previous_loan_number: previous?.loan_number ?? null,
      previous_loan_total_amount: previous ? Number(previous.total_amount || 0) : null,
      previous_loan_status: previous?.status ?? null,
      previous_loan_paid_sum: previous ? Number(paymentsByLoanId.get(previous.id) || 0) : null,
    };
  });

const jerome = matchedMay30
  .filter((loan) => borrowerById.get(loan.borrower_id)?.full_name?.toLowerCase().includes('jerome w. dominguito'))
  .map((loan) => {
    const expected = expectedMay30ByLoanNumber.get(loan.loan_number);
    const previous = loan.previous_loan_id ? prodLoans.find((candidate) => candidate.id === loan.previous_loan_id) : null;
    return {
      loan_number: loan.loan_number,
      status: loan.status,
      release_date: String(loan.release_date || '').slice(0, 10),
      principal: Number(loan.principal_amount || 0),
      total_amount: Number(loan.total_amount || 0),
      total_paid: Number(paymentsByLoanId.get(loan.id) || 0),
      balance_by_db_payments: Number(loan.total_amount || 0) - Number(paymentsByLoanId.get(loan.id) || 0),
      app_deducted_amount: Number(loan.deducted_amount || 0),
      expected_migrated_deducted_amount: 0,
      excel_interest: expected?.interest,
      excel_insurance: expected?.insurance,
      excel_net_loan: expected?.net_loan,
      previous_loan_number: previous?.loan_number ?? null,
      previous_status: previous?.status ?? null,
      previous_total_amount: previous ? Number(previous.total_amount || 0) : null,
      previous_total_paid: previous ? Number(paymentsByLoanId.get(previous.id) || 0) : null,
    };
  });

const duplicateMay30Numbers = [...may30ProdLoans.reduce((map, loan) => {
  map.set(loan.loan_number, (map.get(loan.loan_number) || 0) + 1);
  return map;
}, new Map())].filter(([, count]) => count > 1);

const fieldMismatchCounts = fieldMismatches.reduce((counts, row) => {
  counts[row.field] = (counts[row.field] || 0) + 1;
  return counts;
}, {});

const report = {
  production_url: SUPABASE_URL,
  production_db_host_inferred: 'db.qtkdnpbbukjamqgvbaeh.supabase.co',
  production_db_connection_string_redacted:
    'postgresql://postgres:<PASSWORD>@db.qtkdnpbbukjamqgvbaeh.supabase.co:5432/postgres',
  counts: {
    excel_may30_loans: excelLoans.length,
    production_all_visible_loans: prodLoans.filter((loan) => !loan.deleted_at).length,
    production_may30_loans: may30ProdLoans.length,
    production_may30_matched_to_excel: matchedMay30.length,
    production_may30_missing_from_prod: missingInProd.length,
    production_may30_nonzero_deducted_amount: nonZeroMay30.length,
    production_may30_duplicate_loan_numbers: duplicateMay30Numbers.length,
    production_payments_visible: prodPayments.filter((payment) => !payment.deleted_at).length,
  },
  deduction_summary: {
    expected_for_migrated_may30_loans: 0,
    actual_nonzero_count: deductionMismatches.length,
    actual_nonzero_total: deductionMismatches.reduce((sum, row) => sum + row.actual_deducted_amount, 0),
    count_where_deduction_equals_excel_interest_plus_insurance: deductionMismatches.filter(
      (row) => money(row.actual_deducted_amount) === money(row.excel_interest_plus_insurance)
    ).length,
    count_where_deduction_equals_previous_loan_total_amount: deductionMismatches.filter(
      (row) => money(row.actual_deducted_amount) === money(row.previous_loan_total_amount)
    ).length,
    count_where_previous_loan_is_paid: deductionMismatches.filter((row) => row.previous_loan_status === 'paid').length,
    count_where_previous_loan_paid_sum_equals_previous_total: deductionMismatches.filter(
      (row) => money(row.previous_loan_paid_sum) === money(row.previous_loan_total_amount)
    ).length,
  },
  field_match_summary: {
    checked_fields: ['principal_amount', 'total_amount', 'insurance_amount', 'release_date', 'maturity_date'],
    total_field_mismatches: fieldMismatches.length,
    mismatch_counts_by_field: fieldMismatchCounts,
  },
  jerome_w_dominguito: jerome,
  top_deduction_mismatches: deductionMismatches
    .sort((a, b) => b.actual_deducted_amount - a.actual_deducted_amount)
    .slice(0, 25),
  first_field_mismatches: fieldMismatches.slice(0, 25),
  missing_in_production_sample: missingInProd.slice(0, 10).map((loan) => ({
    loan_number: loan.loan_number,
    ref_id: loan.ref_id,
    borrower_ref: loan.borrower_ref,
  })),
  duplicate_may30_loan_numbers: duplicateMay30Numbers,
};

fs.writeFileSync(
  path.resolve('scripts', 'production-upfront-deduction-audit.json'),
  JSON.stringify(report, null, 2)
);

console.log(JSON.stringify(report, null, 2));
