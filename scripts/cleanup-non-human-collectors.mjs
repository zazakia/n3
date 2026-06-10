import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const HUMAN_COLLECTOR_NAMES = new Set([
  'angelica polo',
  'bernie casera',
  'cresencio junco',
  'gerald gera',
  'jason cayanong',
  'mechelle montillano',
]);

const isApply = process.argv.includes('--apply');

function normalizeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
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

function printCollectorList(title, collectors) {
  console.log(`\n${title}: ${collectors.length}`);
  for (const collector of collectors) {
    console.log(`  - ${collector.full_name} (${collector.borrower_count} active borrowers)`);
  }
}

async function main() {
  const client = createClient();
  await client.connect();

  try {
    const { rows: activeCollectors } = await client.query(`
      SELECT
        c.id,
        c.full_name,
        c.is_active,
        COUNT(b.id)::int AS borrower_count
      FROM public.app_collectors c
      LEFT JOIN public.app_borrowers b
        ON b.collector_id::text = c.id::text
       AND b.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
      GROUP BY c.id, c.full_name, c.is_active
      ORDER BY c.full_name
    `);

    const keep = [];
    const remove = [];

    for (const collector of activeCollectors) {
      if (HUMAN_COLLECTOR_NAMES.has(normalizeName(collector.full_name))) {
        keep.push(collector);
      } else {
        remove.push(collector);
      }
    }

    console.log('Collector cleanup');
    console.log(`Mode: ${isApply ? 'APPLY' : 'DRY RUN'}`);
    console.log(`Active collectors inspected: ${activeCollectors.length}`);
    console.log(`Human collectors to keep: ${keep.length}`);
    console.log(`Non-human collectors to remove: ${remove.length}`);

    printCollectorList('Keeping human collectors', keep);
    printCollectorList(isApply ? 'Collectors removed' : 'Collectors that would be removed', remove);

    if (!isApply) {
      console.log('\nDry run only. Re-run with --apply to soft-delete non-human collectors.');
      return;
    }

    if (remove.length > 0) {
      await client.query('BEGIN');
      try {
        await client.query(
          `
            UPDATE public.app_collectors
            SET is_active = false,
                deleted_at = NOW(),
                updated_at = NOW()
            WHERE id::text = ANY($1::text[])
              AND deleted_at IS NULL
          `,
          [remove.map(collector => collector.id)],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    console.log(`\nSoft-deleted ${remove.length} non-human collector records.`);
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(`\nFailed: ${error.message}`);
  process.exit(1);
});
