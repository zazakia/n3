import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import xlsx from 'xlsx';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const WORKBOOK_PATH = path.resolve(PROJECT_ROOT, 'files (1)', 'WEEKLY-DCS-meshelle.xlsx');
const TARGET_COLLECTOR_NAME = 'Mechelle montillano';
const IGNORED_SHEETS = new Set(['sheet1']);
const SKIP_ROW_RE = /^(Name Of Client|Total|Grand Total|Sub.?Total|\s*)$/i;
const MEETING_DAY_RE = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+Meeting$/i;
const MESHELLE_RE = /m[ei]chelle\s+montillano/i;

const isApply = process.argv.includes('--apply');

function normalizeName(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function displayName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function numericValue(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isBorrowerRow(row, sheetName) {
  const rawName = displayName(row?.[0]);
  if (!rawName || SKIP_ROW_RE.test(rawName) || MEETING_DAY_RE.test(rawName)) {
    return false;
  }

  if (sheetName.toLowerCase() === 'weekly') {
    return numericValue(row[10]) > 0;
  }

  return MESHELLE_RE.test(displayName(row[3]));
}

function parseWorkbookBorrowers() {
  if (!fs.existsSync(WORKBOOK_PATH)) {
    throw new Error(`Workbook not found: ${WORKBOOK_PATH}`);
  }

  const workbook = xlsx.read(fs.readFileSync(WORKBOOK_PATH), { type: 'buffer' });
  const borrowersByKey = new Map();

  for (const sheetName of workbook.SheetNames) {
    if (IGNORED_SHEETS.has(sheetName.toLowerCase())) {
      continue;
    }

    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    if (!rows.length) {
      continue;
    }

    for (let rowIndex = 4; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      if (!isBorrowerRow(row, sheetName)) {
        continue;
      }

      const name = displayName(row[0]);
      const key = normalizeName(name);
      if (!key) {
        continue;
      }

      const existing = borrowersByKey.get(key);
      if (existing) {
        existing.sheets.add(sheetName);
      } else {
        borrowersByKey.set(key, {
          name,
          sheets: new Set([sheetName]),
        });
      }
    }
  }

  return borrowersByKey;
}

function createClient() {
  return new pg.Client({
    host: process.env.SUPABASE_DB_HOST || '127.0.0.1',
    port: Number(process.env.SUPABASE_DB_PORT || '55322'),
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    user: process.env.SUPABASE_DB_USER || 'postgres',
    password:
      process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD ||
      process.env.SUPABASE_DB_PASSWORD ||
      'postgres',
  });
}

function printList(title, rows, formatRow) {
  console.log(`\n${title}: ${rows.length}`);
  for (const row of rows) {
    console.log(`  - ${formatRow(row)}`);
  }
}

async function main() {
  const workbookBorrowers = parseWorkbookBorrowers();
  const client = createClient();

  await client.connect();
  try {
    const collectorResult = await client.query(
      `
        SELECT id, full_name
        FROM public.app_collectors
        WHERE lower(full_name) = lower($1)
          AND deleted_at IS NULL
          AND is_active = true
        ORDER BY full_name
      `,
      [TARGET_COLLECTOR_NAME],
    );

    if (collectorResult.rowCount !== 1) {
      throw new Error(
        `Expected exactly one active collector named "${TARGET_COLLECTOR_NAME}", found ${collectorResult.rowCount}.`,
      );
    }

    const targetCollector = collectorResult.rows[0];
    const borrowerResult = await client.query(`
      SELECT
        b.id,
        b.full_name,
        b.collector_id,
        c.full_name AS collector_name
      FROM public.app_borrowers b
      LEFT JOIN public.app_collectors c
        ON c.id::text = b.collector_id::text
      WHERE b.deleted_at IS NULL
    `);

    const dbBorrowersByKey = new Map();
    for (const borrower of borrowerResult.rows) {
      const key = normalizeName(borrower.full_name);
      if (!dbBorrowersByKey.has(key)) {
        dbBorrowersByKey.set(key, []);
      }
      dbBorrowersByKey.get(key).push(borrower);
    }

    const matched = [];
    const alreadyAssigned = [];
    const toUpdate = [];
    const ambiguous = [];
    const missing = [];

    for (const [key, workbookBorrower] of workbookBorrowers) {
      const dbMatches = dbBorrowersByKey.get(key) ?? [];
      if (dbMatches.length === 0) {
        missing.push(workbookBorrower);
        continue;
      }

      if (dbMatches.length > 1) {
        ambiguous.push({ workbookBorrower, matches: dbMatches });
        continue;
      }

      const borrower = dbMatches[0];
      matched.push({ workbookBorrower, borrower });

      if (borrower.collector_id === targetCollector.id) {
        alreadyAssigned.push({ workbookBorrower, borrower });
      } else {
        toUpdate.push({ workbookBorrower, borrower });
      }
    }

    console.log('Meshelle borrower assignment');
    console.log(`Mode: ${isApply ? 'APPLY' : 'DRY RUN'}`);
    console.log(`Workbook: ${WORKBOOK_PATH}`);
    console.log(`Target collector: ${targetCollector.full_name} (${targetCollector.id})`);
    console.log('');
    console.log(`Workbook unique borrowers: ${workbookBorrowers.size}`);
    console.log(`Matched exact borrowers: ${matched.length}`);
    console.log(`Already assigned: ${alreadyAssigned.length}`);
    console.log(`To update: ${toUpdate.length}`);
    console.log(`Missing exact matches: ${missing.length}`);
    console.log(`Ambiguous exact matches: ${ambiguous.length}`);

    if (missing.length > 0) {
      printList('Missing exact matches', missing, row => `${row.name} [${Array.from(row.sheets).join(', ')}]`);
    }

    if (ambiguous.length > 0) {
      printList(
        'Ambiguous exact matches',
        ambiguous,
        row => `${row.workbookBorrower.name} (${row.matches.length} DB rows)`,
      );
    }

    if (toUpdate.length > 0) {
      printList(
        isApply ? 'Borrowers updated' : 'Borrowers that would be updated',
        toUpdate,
        row => `${row.borrower.full_name} (${row.borrower.collector_name || 'Unassigned'} -> ${targetCollector.full_name})`,
      );
    }

    if (!isApply) {
      console.log('\nDry run only. Re-run with --apply to update borrower collector assignments.');
      return;
    }

    if (ambiguous.length > 0) {
      throw new Error('Refusing to apply while ambiguous exact borrower matches exist.');
    }

    if (toUpdate.length > 0) {
      await client.query('BEGIN');
      try {
        for (const row of toUpdate) {
          await client.query(
            `
              UPDATE public.app_borrowers
              SET collector_id = $1,
                  updated_at = NOW()
              WHERE id = $2
                AND deleted_at IS NULL
            `,
            [targetCollector.id, row.borrower.id],
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    console.log(`\nApplied ${toUpdate.length} borrower collector assignment updates.`);
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(`\nFailed: ${error.message}`);
  process.exit(1);
});
