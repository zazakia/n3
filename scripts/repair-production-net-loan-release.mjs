import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Client } = pg;

const DATA_DIR = path.resolve('scripts', 'migration-data');
const REPORT_PATH = path.resolve('scripts', 'production-net-loan-release-repair-report.json');
const APPLY = process.argv.includes('--apply');
const TOLERANCE = 0.01;

function getProductionPassword() {
  if (process.env.REMOTE_DB_PASSWORD) return process.env.REMOTE_DB_PASSWORD;

  const migrationScript = fs.readFileSync(path.resolve('scripts', 'migrate-all-dbs.mjs'), 'utf8');
  const match = migrationScript.match(/password:\s*'([^']+)'/);
  if (!match) {
    throw new Error('Missing REMOTE_DB_PASSWORD and could not read production password from migrate-all-dbs.mjs');
  }
  return match[1];
}

const DB_CONFIG = {
  host: 'db.qtkdnpbbukjamqgvbaeh.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: getProductionPassword(),
  ssl: { rejectUnauthorized: false },
};

function uuid(seed) {
  const hash = crypto.createHash('md5').update(seed).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

function money(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function loadLoans() {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'loans.json'), 'utf8'));
}

function expectedDeductedFromExcel(loan) {
  const principal = money(loan.loan_amount);
  const netLoan = money(loan.net_loan);
  return money(Math.max(0, principal - netLoan));
}

const client = new Client(DB_CONFIG);
const excelLoans = loadLoans();

await client.connect();

try {
  const { rows: dbLoans } = await client.query(`
    SELECT id, loan_number, borrower_id, principal_amount::numeric, deducted_amount::numeric
    FROM public.app_loans
    WHERE deleted_at IS NULL
      AND loan_number LIKE 'LN-2025-MAY30-%'
    ORDER BY loan_number;
  `);
  const { rows: borrowers } = await client.query(`
    SELECT id, full_name
    FROM public.app_borrowers
    WHERE deleted_at IS NULL;
  `);

  const dbLoanById = new Map(dbLoans.map(loan => [loan.id, loan]));
  const borrowerById = new Map(borrowers.map(borrower => [borrower.id, borrower]));
  const changes = [];
  const missing = [];
  const verificationFailures = [];

  excelLoans.forEach((excelLoan, index) => {
    const id = uuid(`loan-may30-${excelLoan.ref_id}`);
    const dbLoan = dbLoanById.get(id);
    const loanNumber = `LN-2025-MAY30-${String(index + 1).padStart(4, '0')}`;

    if (!dbLoan) {
      missing.push({ id, loanNumber, ref_id: excelLoan.ref_id });
      return;
    }

    const principal = money(dbLoan.principal_amount);
    const expectedDeducted = expectedDeductedFromExcel(excelLoan);
    const currentDeducted = money(dbLoan.deducted_amount);
    const expectedNetLoanRelease = money(excelLoan.net_loan);
    const dbNetLoanReleaseAfterRepair = money(principal - expectedDeducted);

    if (Math.abs(dbNetLoanReleaseAfterRepair - expectedNetLoanRelease) > TOLERANCE) {
      verificationFailures.push({
        loanNumber,
        borrower: borrowerById.get(dbLoan.borrower_id)?.full_name ?? null,
        principal,
        expectedDeducted,
        expectedNetLoanRelease,
        dbNetLoanReleaseAfterRepair,
      });
      return;
    }

    if (Math.abs(currentDeducted - expectedDeducted) > TOLERANCE) {
      changes.push({
        id,
        loanNumber: dbLoan.loan_number,
        borrower: borrowerById.get(dbLoan.borrower_id)?.full_name ?? null,
        oldDeducted: currentDeducted,
        newDeducted: expectedDeducted,
        oldNetLoanRelease: money(principal - currentDeducted),
        newNetLoanRelease: dbNetLoanReleaseAfterRepair,
        excelNetLoan: expectedNetLoanRelease,
      });
    }
  });

  if (APPLY && verificationFailures.length === 0) {
    await client.query('BEGIN');
    try {
      for (const change of changes) {
        await client.query(
          `
            UPDATE public.app_loans
            SET deducted_amount = $1,
                updated_at = NOW()
            WHERE id = $2;
          `,
          [change.newDeducted, change.id]
        );
      }
      await client.query("NOTIFY pgrst, 'reload schema';");
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  const { rows: postRepairRows } = await client.query(`
    SELECT id, loan_number, principal_amount::numeric, deducted_amount::numeric
    FROM public.app_loans
    WHERE deleted_at IS NULL
      AND loan_number LIKE 'LN-2025-MAY30-%'
    ORDER BY loan_number;
  `);
  const postRepairById = new Map(postRepairRows.map(loan => [loan.id, loan]));
  const postRepairNetMismatches = [];

  excelLoans.forEach((excelLoan, index) => {
    const id = uuid(`loan-may30-${excelLoan.ref_id}`);
    const dbLoan = postRepairById.get(id);
    if (!dbLoan) return;

    const expectedNetLoan = money(excelLoan.net_loan);
    const actualNetLoan = money(Number(dbLoan.principal_amount || 0) - Number(dbLoan.deducted_amount || 0));
    if (Math.abs(actualNetLoan - expectedNetLoan) > TOLERANCE) {
      postRepairNetMismatches.push({
        loanNumber: `LN-2025-MAY30-${String(index + 1).padStart(4, '0')}`,
        expectedNetLoan,
        actualNetLoan,
        deductedAmount: money(dbLoan.deducted_amount),
      });
    }
  });

  const report = {
    mode: APPLY ? 'applied' : 'dry-run',
    generatedAt: new Date().toISOString(),
    source: {
      excelData: path.join(DATA_DIR, 'loans.json'),
      productionDb: 'db.qtkdnpbbukjamqgvbaeh.supabase.co',
    },
    rule: 'deducted_amount = Excel Loan Amount - Excel Net Loan; app Net Loan Release = principal_amount - deducted_amount',
    counts: {
      excelLoans: excelLoans.length,
      productionMay30Loans: dbLoans.length,
      missingProductionLoans: missing.length,
      preRepairChangesNeeded: changes.length,
      preRepairVerificationFailures: verificationFailures.length,
      postRepairNetLoanMismatches: postRepairNetMismatches.length,
    },
    totals: {
      oldDeductedAmount: money(changes.reduce((sum, change) => sum + change.oldDeducted, 0)),
      newDeductedAmount: money(changes.reduce((sum, change) => sum + change.newDeducted, 0)),
    },
    samples: {
      jerome: changes.filter(change => change.borrower === 'Jerome W. Dominguito'),
      firstChanges: changes.slice(0, 25),
      postRepairNetMismatches: postRepairNetMismatches.slice(0, 25),
      missing: missing.slice(0, 25),
      verificationFailures: verificationFailures.slice(0, 25),
    },
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.end();
}
