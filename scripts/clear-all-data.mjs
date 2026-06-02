/**
 * clear-all-data.mjs
 * 
 * Clears ALL business/loan data from Supabase (local and/or remote).
 * Preserves: user_profiles, app_collectors, auth.users, auth.identities
 * 
 * Usage:
 *   node scripts/clear-all-data.mjs --target local --confirm
 *   node scripts/clear-all-data.mjs --target remote --confirm
 *   node scripts/clear-all-data.mjs --target both --confirm
 *   node scripts/clear-all-data.mjs --target local          # dry-run (shows counts only)
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const { Client } = pg;

// Tables to clear, in FK-safe deletion order (children first)
const TABLES_TO_CLEAR = [
  'app_payment_schedules',
  'app_payments',
  'app_loan_penalties',
  'app_collection_logs',
  'app_savings_transactions',
  'app_loans',
  'app_borrowers',
  'app_bank_transactions',
  'app_bank_accounts',
  'app_expenses',
  'app_recurring_expenses',
  'app_cash_transactions',
  'app_financial_snapshots',
  'app_remittances',
  'app_action_logs',
  'app_expense_categories',
  'collection_groups',
];

// Tables to KEEP (never touch)
const TABLES_PRESERVED = [
  'user_profiles',
  'app_collectors',
  // auth.users and auth.identities are in auth schema, not touched
];

function parseArgs() {
  const args = process.argv.slice(2);
  const target = args.find(a => a !== '--confirm' && a !== '--target')
    || args[args.indexOf('--target') + 1]
    || 'local';
  const confirm = args.includes('--confirm');
  return { target, confirm };
}

function getLocalConfig() {
  return {
    host: process.env.SUPABASE_DB_HOST || '127.0.0.1',
    port: Number(process.env.SUPABASE_DB_PORT || '55322'),
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    user: process.env.SUPABASE_DB_USER || 'postgres',
    password: process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD || 'postgres',
  };
}

function getRemoteConfig() {
  // Remote Supabase uses the Supabase JS client (REST API) since direct PG access
  // requires connection pooling credentials. We'll use the service role key.
  const url = process.env.REMOTE_SUPABASE_URL || 'https://qtkdnpbbukjamqgvbaeh.supabase.co';
  const key = process.env.REMOTE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error('❌ Missing REMOTE_SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY in .env');
    console.error('   Add: SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
    process.exit(1);
  }
  return { url, key };
}

async function clearLocalDatabase(dryRun) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🖥️  LOCAL DATABASE (port 55322)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const client = new Client(getLocalConfig());

  try {
    await client.connect();
    console.log('✅ Connected to local database\n');

    // Show current row counts
    console.log('📊 Current row counts:');
    console.log('─────────────────────────────────────────');
    
    const counts = {};
    for (const table of [...TABLES_TO_CLEAR, ...TABLES_PRESERVED]) {
      try {
        const res = await client.query(`SELECT COUNT(*) as cnt FROM public.${table}`);
        counts[table] = parseInt(res.rows[0].cnt);
        const icon = TABLES_PRESERVED.includes(table) ? '🔒' : '🗑️';
        console.log(`  ${icon} ${table.padEnd(30)} ${String(counts[table]).padStart(6)} rows`);
      } catch (e) {
        console.log(`  ⚠️  ${table.padEnd(30)} (table not found)`);
      }
    }

    if (dryRun) {
      console.log('\n⏸️  DRY RUN — no data deleted. Add --confirm to execute.');
      return counts;
    }

    // Delete data
    console.log('\n🗑️  Deleting data...');
    console.log('─────────────────────────────────────────');
    
    for (const table of TABLES_TO_CLEAR) {
      try {
        const res = await client.query(`DELETE FROM public.${table}`);
        if (res.rowCount > 0) {
          console.log(`  ✅ ${table.padEnd(30)} ${String(res.rowCount).padStart(6)} rows deleted`);
        } else {
          console.log(`  ⬚  ${table.padEnd(30)}      0 rows (already empty)`);
        }
      } catch (e) {
        console.log(`  ❌ ${table.padEnd(30)} Error: ${e.message}`);
      }
    }

    // Reload PostgREST cache
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('\n✅ PostgREST schema cache reloaded');

    return counts;
  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

async function clearRemoteDatabase(dryRun) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('☁️  REMOTE DATABASE (Supabase Cloud)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const { url, key } = getRemoteConfig();
  const supabase = createClient(url, key);

  console.log(`✅ Connected to ${url}\n`);

  // Show current row counts
  console.log('📊 Current row counts:');
  console.log('─────────────────────────────────────────');

  for (const table of [...TABLES_TO_CLEAR, ...TABLES_PRESERVED]) {
    try {
      const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) throw error;
      const icon = TABLES_PRESERVED.includes(table) ? '🔒' : '🗑️';
      console.log(`  ${icon} ${table.padEnd(30)} ${String(count).padStart(6)} rows`);
    } catch (e) {
      console.log(`  ⚠️  ${table.padEnd(30)} (${e.message})`);
    }
  }

  if (dryRun) {
    console.log('\n⏸️  DRY RUN — no data deleted. Add --confirm to execute.');
    return;
  }

  // Delete data using Supabase client (needs service role to bypass RLS)
  console.log('\n🗑️  Deleting data...');
  console.log('─────────────────────────────────────────');

  for (const table of TABLES_TO_CLEAR) {
    try {
      // Delete all rows - using a filter that matches everything
      // .neq('id', '00000000-0000-0000-0000-000000000000') matches all UUIDs
      const { error, count } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;
      if (count > 0) {
        console.log(`  ✅ ${table.padEnd(30)} ${String(count).padStart(6)} rows deleted`);
      } else {
        console.log(`  ⬚  ${table.padEnd(30)}      0 rows (already empty)`);
      }
    } catch (e) {
      console.log(`  ❌ ${table.padEnd(30)} Error: ${e.message}`);
    }
  }

  console.log('\n✅ Remote database cleared');
}

async function main() {
  const { target, confirm } = parseArgs();
  const dryRun = !confirm;

  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   CLEAR ALL BUSINESS DATA                 ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log(`║  Target:  ${target.padEnd(32)}║`);
  console.log(`║  Mode:    ${(dryRun ? 'DRY RUN (preview)' : '⚠️  LIVE DELETE').padEnd(32)}║`);
  console.log('╠═══════════════════════════════════════════╣');
  console.log('║  🔒 PRESERVED: user_profiles, collectors  ║');
  console.log(`║  🗑️  CLEARING: ${TABLES_TO_CLEAR.length} business tables           ║`);
  console.log('╚═══════════════════════════════════════════╝');

  if (target === 'local' || target === 'both') {
    await clearLocalDatabase(dryRun);
  }

  if (target === 'remote' || target === 'both') {
    await clearRemoteDatabase(dryRun);
  }

  console.log('\n════════════════════════════════════════════');
  if (dryRun) {
    console.log('✅ Dry run complete. Run with --confirm to delete.');
  } else {
    console.log('✅ All business data cleared successfully!');
    console.log('   Users and collectors preserved.');
    console.log('\n   Next: Run the migration script to import fresh data.');
  }
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
