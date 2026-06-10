import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.production' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const isApply = process.argv.includes('--apply');

const SKIP_ROW_RE = /^(Name Of Client|Total|Grand Total|Sub.?Total|\s*)$/i;
const MEETING_DAY_RE = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+Meeting$/i;
const MESHELLE_RE = /m[ei]chelle\s+montillano/i;
const HUMAN_COLLECTOR_NAMES = new Set([
  'angelica polo',
  'bernie casera',
  'cresencio junco',
  'gerald gera',
  'jason cayanong',
  'mechelle montillano',
]);

const workbookJobs = [
  {
    label: 'Angelica',
    workbookPath: path.resolve(PROJECT_ROOT, 'files (1)', 'WEEKLY-DCS-angelica.xlsx'),
    targetCollectorName: 'Angelica Polo',
    routeCollectorMatches: value => displayName(value).toLowerCase().includes('angelica'),
  },
  {
    label: 'Meshelle',
    workbookPath: path.resolve(PROJECT_ROOT, 'files (1)', 'WEEKLY-DCS-meshelle.xlsx'),
    targetCollectorName: 'Mechelle montillano',
    routeCollectorMatches: value => MESHELLE_RE.test(displayName(value)),
  },
];

function normalizeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function displayName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function numericValue(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isBorrowerRow(row, sheetName, routeCollectorMatches) {
  const rawName = displayName(row?.[0]);
  if (!rawName || SKIP_ROW_RE.test(rawName) || MEETING_DAY_RE.test(rawName)) {
    return false;
  }

  if (sheetName.toLowerCase() === 'weekly') {
    return numericValue(row[10]) > 0;
  }

  return routeCollectorMatches(row[3]);
}

function parseWorkbookBorrowers(job) {
  if (!fs.existsSync(job.workbookPath)) {
    throw new Error(`Workbook not found: ${job.workbookPath}`);
  }

  const workbook = xlsx.read(fs.readFileSync(job.workbookPath), { type: 'buffer' });
  const borrowersByKey = new Map();

  for (const sheetName of workbook.SheetNames) {
    if (sheetName.toLowerCase() === 'sheet1') {
      continue;
    }

    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    if (!rows.length) {
      continue;
    }

    for (let rowIndex = 4; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      if (!isBorrowerRow(row, sheetName, job.routeCollectorMatches)) {
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
        borrowersByKey.set(key, { name, sheets: new Set([sheetName]) });
      }
    }
  }

  return borrowersByKey;
}

function createSupabaseClient() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.production');
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchAll(supabase, table, select, filters = callback => callback) {
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    query = filters(query);
    const { data, error } = await query;
    if (error) {
      throw new Error(`${table} select failed: ${error.message}`);
    }
    rows.push(...data);
    if (data.length < pageSize) {
      return rows;
    }
  }
}

function buildBorrowerMap(borrowers) {
  const dbBorrowersByKey = new Map();
  for (const borrower of borrowers) {
    const key = normalizeName(borrower.full_name);
    if (!dbBorrowersByKey.has(key)) {
      dbBorrowersByKey.set(key, []);
    }
    dbBorrowersByKey.get(key).push(borrower);
  }
  return dbBorrowersByKey;
}

function printList(title, rows, formatRow) {
  console.log(`\n${title}: ${rows.length}`);
  for (const row of rows) {
    console.log(`  - ${formatRow(row)}`);
  }
}

async function updateBorrowers(supabase, rows, targetCollector) {
  for (const row of rows) {
    const { error } = await supabase
      .from('app_borrowers')
      .update({
        collector_id: targetCollector.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.borrower.id)
      .is('deleted_at', null);

    if (error) {
      throw new Error(`Failed to update borrower ${row.borrower.full_name}: ${error.message}`);
    }
  }
}

async function softDeleteCollectors(supabase, collectors) {
  if (collectors.length === 0) {
    return;
  }

  const { error } = await supabase
    .from('app_collectors')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('id', collectors.map(collector => collector.id))
    .is('deleted_at', null);

  if (error) {
    throw new Error(`Failed to soft-delete collectors: ${error.message}`);
  }
}

async function main() {
  const supabase = createSupabaseClient();
  const collectors = await fetchAll(
    supabase,
    'app_collectors',
    'id, full_name, is_active, deleted_at',
    query => query.is('deleted_at', null),
  );
  const borrowers = await fetchAll(
    supabase,
    'app_borrowers',
    'id, full_name, collector_id, deleted_at',
    query => query.is('deleted_at', null),
  );

  const collectorsById = new Map(collectors.map(collector => [collector.id, collector]));
  const collectorsByName = new Map(collectors.map(collector => [normalizeName(collector.full_name), collector]));
  const dbBorrowersByKey = buildBorrowerMap(borrowers);

  console.log('Production collector repairs');
  console.log(`Mode: ${isApply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Supabase URL: ${process.env.EXPO_PUBLIC_SUPABASE_URL}`);
  console.log(`Active collectors read: ${collectors.length}`);
  console.log(`Active borrowers read: ${borrowers.length}`);

  for (const job of workbookJobs) {
    const targetCollector = collectorsByName.get(normalizeName(job.targetCollectorName));
    if (!targetCollector) {
      throw new Error(`Target collector not found in production: ${job.targetCollectorName}`);
    }

    const workbookBorrowers = parseWorkbookBorrowers(job);
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

    console.log(`\n${job.label} borrower assignment`);
    console.log(`Target collector: ${targetCollector.full_name} (${targetCollector.id})`);
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
      printList('Ambiguous exact matches', ambiguous, row => `${row.workbookBorrower.name} (${row.matches.length} DB rows)`);
    }

    if (isApply) {
      if (ambiguous.length > 0) {
        throw new Error(`Refusing to apply ${job.label}: ambiguous exact borrower matches exist.`);
      }
      await updateBorrowers(supabase, toUpdate, targetCollector);
      for (const row of toUpdate) {
        row.borrower.collector_id = targetCollector.id;
      }
      console.log(`Applied ${toUpdate.length} ${job.label} borrower updates.`);
    }
  }

  const refreshedBorrowers = isApply
    ? await fetchAll(supabase, 'app_borrowers', 'id, full_name, collector_id, deleted_at', query => query.is('deleted_at', null))
    : borrowers;
  const borrowerCountByCollectorId = new Map();
  for (const borrower of refreshedBorrowers) {
    borrowerCountByCollectorId.set(
      borrower.collector_id,
      (borrowerCountByCollectorId.get(borrower.collector_id) ?? 0) + 1,
    );
  }

  const humanCollectors = [];
  const nonHumanCollectors = [];
  for (const collector of collectors) {
    const row = {
      ...collector,
      borrower_count: borrowerCountByCollectorId.get(collector.id) ?? 0,
    };
    if (HUMAN_COLLECTOR_NAMES.has(normalizeName(collector.full_name))) {
      humanCollectors.push(row);
    } else {
      nonHumanCollectors.push(row);
    }
  }

  printList('Human collectors kept', humanCollectors, row => `${row.full_name} (${row.borrower_count} active borrowers)`);
  printList(
    isApply ? 'Non-human collectors removed' : 'Non-human collectors that would be removed',
    nonHumanCollectors,
    row => `${row.full_name} (${row.borrower_count} active borrowers)`,
  );

  if (isApply) {
    await softDeleteCollectors(supabase, nonHumanCollectors);
    console.log(`Soft-deleted ${nonHumanCollectors.length} non-human collector records.`);
  } else {
    console.log('\nDry run only. Re-run with --apply to update production.');
  }

  void collectorsById;
}

main().catch(error => {
  console.error(`\nFailed: ${error.message}`);
  process.exit(1);
});
