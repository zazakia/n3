import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const isApply = args.has('--apply');
const targetArg = process.argv.find(arg => arg.startsWith('--target='));
const target = targetArg ? targetArg.split('=')[1] : 'local';

if (!['local', 'production'].includes(target)) {
  throw new Error('Invalid target. Use --target=local or --target=production.');
}

dotenv.config({ path: target === 'production' ? '.env.production' : '.env' });

const WORKBOOKS = [
  path.resolve(PROJECT_ROOT, 'files (1)', 'WEEKLY-DCS-angelica.xlsx'),
  path.resolve(PROJECT_ROOT, 'files (1)', 'WEEKLY-DCS-meshelle.xlsx'),
];

const IGNORED_SHEETS = new Set(['weekly', 'sheet1']);
const SKIP_ROW_RE = /^(Name Of Client|Total|Grand Total|Sub.?Total|\s*)$/i;
const MEETING_DAY_RE = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+Meeting$/i;

function normalizeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function displayName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeGroup(value) {
  return displayName(value).replace(/\s+$/g, '');
}

function findHeaderRowIndex(rows) {
  return rows.findIndex(row => /^Name Of Client$/i.test(displayName(row?.[0])));
}

function sheetTitleFromRows(sheetName, rows, headerRowIndex) {
  const title = displayName(rows[headerRowIndex - 1]?.[0]);
  return title || displayName(sheetName);
}

function meetingDayFromRows(rows, headerRowIndex) {
  for (const row of rows.slice(0, Math.max(0, headerRowIndex))) {
    const value = displayName(row?.[0]);
    const match = value.match(MEETING_DAY_RE);
    if (match) return match[1];
  }
  return null;
}

function isAreaBorrowerRow(row) {
  const rawName = displayName(row?.[0]);
  if (!rawName || SKIP_ROW_RE.test(rawName) || MEETING_DAY_RE.test(rawName)) {
    return false;
  }

  const address = displayName(row?.[1]);
  const collector = displayName(row?.[3]);
  const hasFinancialValue = [4, 5, 6, 7, 8].some(index => displayName(row?.[index]));
  return Boolean(address || collector || hasFinancialValue);
}

function parseWorkbookAreaAssignments() {
  const assignments = new Map();

  for (const workbookPath of WORKBOOKS) {
    if (!fs.existsSync(workbookPath)) {
      throw new Error(`Workbook not found: ${workbookPath}`);
    }

    const workbook = xlsx.read(fs.readFileSync(workbookPath), { type: 'buffer' });
    for (const sheetName of workbook.SheetNames) {
      if (IGNORED_SHEETS.has(sheetName.trim().toLowerCase())) {
        continue;
      }

      const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
      if (!rows.length) continue;

      const headerRowIndex = findHeaderRowIndex(rows);
      if (headerRowIndex < 1) {
        continue;
      }

      const groupName = normalizeGroup(sheetTitleFromRows(sheetName, rows, headerRowIndex));
      const meetingDay = meetingDayFromRows(rows, headerRowIndex);

      for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] ?? [];
        if (!isAreaBorrowerRow(row)) continue;

        const fullName = displayName(row[0]);
        const key = normalizeName(fullName);
        if (!key) continue;

        const assignment = {
          fullName,
          group: groupName,
          area: groupName,
          meetingDay,
          sheetName,
          workbook: path.basename(workbookPath),
        };

        if (!assignments.has(key)) {
          assignments.set(key, []);
        }
        assignments.get(key).push(assignment);
      }
    }
  }

  return assignments;
}

function collapseAssignments(assignmentsByKey) {
  const resolved = new Map();
  const duplicateConflicts = [];

  for (const [key, assignments] of assignmentsByKey.entries()) {
    const uniqueGroups = new Set(assignments.map(row => normalizeName(row.group)));
    if (uniqueGroups.size > 1) {
      duplicateConflicts.push({ key, assignments });
      continue;
    }
    resolved.set(key, assignments[0]);
  }

  return { resolved, duplicateConflicts };
}

function createPgClient() {
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

function createSupabaseClient() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function fetchLocalWeeklyBorrowers() {
  const client = createPgClient();
  await client.connect();
  const result = await client.query(`
    SELECT DISTINCT
      b.id::text,
      b.full_name,
      b."group",
      b.area,
      b.meeting_day
    FROM public.app_borrowers b
    JOIN public.app_loans l
      ON l.borrower_id::text = b.id::text
    WHERE b.deleted_at IS NULL
      AND l.deleted_at IS NULL
      AND l.status = 'active'
      AND l.frequency = 'weekly'
    ORDER BY b.full_name
  `);
  await client.end();
  return result.rows;
}

async function fetchProductionWeeklyBorrowers(supabase) {
  const [borrowers, loans] = await Promise.all([
    fetchAll(supabase, 'app_borrowers', 'id, full_name, group, area, meeting_day, deleted_at', query => query.is('deleted_at', null)),
    fetchAll(supabase, 'app_loans', 'borrower_id, frequency, status, deleted_at', query => query.is('deleted_at', null).eq('frequency', 'weekly').eq('status', 'active')),
  ]);

  const activeWeeklyBorrowerIds = new Set(loans.map(loan => String(loan.borrower_id)));
  return borrowers
    .filter(borrower => activeWeeklyBorrowerIds.has(String(borrower.id)))
    .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
}

async function fetchAll(supabase, table, select, filters = query => query) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    query = filters(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table} select failed: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

function analyzeRows(weeklyBorrowers, resolvedAssignments) {
  const dbByName = new Map();
  for (const borrower of weeklyBorrowers) {
    const key = normalizeName(borrower.full_name);
    if (!dbByName.has(key)) dbByName.set(key, []);
    dbByName.get(key).push(borrower);
  }

  const toUpdate = [];
  const alreadyCorrect = [];
  const missingInWorkbook = [];
  const ambiguousDbMatches = [];

  for (const borrower of weeklyBorrowers) {
    const key = normalizeName(borrower.full_name);
    const matches = dbByName.get(key) ?? [];
    if (matches.length > 1) {
      ambiguousDbMatches.push({ borrower, matches });
      continue;
    }

    const assignment = resolvedAssignments.get(key);
    if (!assignment) {
      missingInWorkbook.push(borrower);
      continue;
    }

    const currentGroup = displayName(borrower.group);
    const currentArea = displayName(borrower.area);
    const currentMeetingDay = displayName(borrower.meeting_day);
    const nextMeetingDay = assignment.meetingDay || currentMeetingDay || null;

    if (
      currentGroup === assignment.group &&
      currentArea === assignment.area &&
      currentMeetingDay === (nextMeetingDay || '')
    ) {
      alreadyCorrect.push({ borrower, assignment });
    } else {
      toUpdate.push({ borrower, assignment: { ...assignment, meetingDay: nextMeetingDay } });
    }
  }

  return { toUpdate, alreadyCorrect, missingInWorkbook, ambiguousDbMatches };
}

async function applyLocalUpdates(toUpdate) {
  const client = createPgClient();
  await client.connect();
  await client.query('BEGIN');
  try {
    for (const row of toUpdate) {
      await client.query(
        `
          UPDATE public.app_borrowers
          SET "group" = $1,
              area = $2,
              meeting_day = $3,
              updated_at = NOW()
          WHERE id::text = $4
            AND deleted_at IS NULL
        `,
        [row.assignment.group, row.assignment.area, row.assignment.meetingDay, row.borrower.id],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function applyProductionUpdates(supabase, toUpdate) {
  for (const row of toUpdate) {
    const { error } = await supabase
      .from('app_borrowers')
      .update({
        group: row.assignment.group,
        area: row.assignment.area,
        meeting_day: row.assignment.meetingDay,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.borrower.id)
      .is('deleted_at', null);

    if (error) {
      throw new Error(`Failed to update ${row.borrower.full_name}: ${error.message}`);
    }
  }
}

function countBy(rows, getValue) {
  const counts = new Map();
  for (const row of rows) {
    const value = getValue(row) || '(blank)';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function printRows(title, rows, format, limit = 25) {
  console.log(`\n${title}: ${rows.length}`);
  for (const row of rows.slice(0, limit)) {
    console.log(`  - ${format(row)}`);
  }
  if (rows.length > limit) {
    console.log(`  ... ${rows.length - limit} more`);
  }
}

async function main() {
  const rawAssignments = parseWorkbookAreaAssignments();
  const { resolved, duplicateConflicts } = collapseAssignments(rawAssignments);

  const supabase = target === 'production' ? createSupabaseClient() : null;
  const weeklyBorrowers = target === 'production'
    ? await fetchProductionWeeklyBorrowers(supabase)
    : await fetchLocalWeeklyBorrowers();

  const analysis = analyzeRows(weeklyBorrowers, resolved);

  console.log('Weekly group repair from area tabs');
  console.log(`Mode: ${isApply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Target: ${target}`);
  console.log(`Workbooks: ${WORKBOOKS.map(file => path.basename(file)).join(', ')}`);
  console.log(`Workbook unique assignment names: ${rawAssignments.size}`);
  console.log(`Resolved workbook names: ${resolved.size}`);
  console.log(`Workbook group conflicts: ${duplicateConflicts.length}`);
  console.log(`Active weekly borrowers in DB: ${weeklyBorrowers.length}`);
  console.log(`Already correct: ${analysis.alreadyCorrect.length}`);
  console.log(`To update: ${analysis.toUpdate.length}`);
  console.log(`Missing in workbook tabs: ${analysis.missingInWorkbook.length}`);
  console.log(`Ambiguous DB name matches: ${analysis.ambiguousDbMatches.length}`);

  printRows(
    'Current DB groups',
    countBy(weeklyBorrowers, row => displayName(row.group)),
    ([group, count]) => `${group}: ${count}`,
    50,
  );

  printRows(
    'New groups after repair',
    countBy(
      weeklyBorrowers.map(row => {
        const update = analysis.toUpdate.find(item => item.borrower.id === row.id);
        return update ? { ...row, group: update.assignment.group } : row;
      }),
      row => displayName(row.group),
    ),
    ([group, count]) => `${group}: ${count}`,
    80,
  );

  printRows(
    isApply ? 'Rows updated' : 'Rows that would be updated',
    analysis.toUpdate,
    row => `${row.borrower.full_name}: ${displayName(row.borrower.group) || '(blank)'} -> ${row.assignment.group} (${row.assignment.meetingDay || 'no meeting day'})`,
  );

  if (duplicateConflicts.length > 0) {
    printRows(
      'Workbook duplicate-name group conflicts',
      duplicateConflicts,
      row => `${row.assignments[0].fullName}: ${row.assignments.map(item => `${item.group}/${item.workbook}`).join(', ')}`,
    );
  }

  if (analysis.ambiguousDbMatches.length > 0) {
    printRows(
      'Ambiguous DB name matches',
      analysis.ambiguousDbMatches,
      row => `${row.borrower.full_name}: ${row.matches.length} rows`,
    );
  }

  if (analysis.missingInWorkbook.length > 0) {
    printRows(
      'Active weekly borrowers missing from area tabs',
      analysis.missingInWorkbook,
      row => `${row.full_name} [${displayName(row.group) || '(blank)'}]`,
    );
  }

  if (!isApply) {
    console.log('\nDry run only. Re-run with --apply to update borrower group, area, and meeting_day.');
    return;
  }

  if (duplicateConflicts.length > 0 || analysis.ambiguousDbMatches.length > 0) {
    throw new Error('Refusing to apply while workbook or DB name conflicts exist.');
  }

  if (target === 'production') {
    await applyProductionUpdates(supabase, analysis.toUpdate);
  } else {
    await applyLocalUpdates(analysis.toUpdate);
  }

  console.log(`\nApplied ${analysis.toUpdate.length} weekly borrower group repairs.`);
}

main().catch(error => {
  console.error(`\nFailed: ${error.message}`);
  process.exit(1);
});
