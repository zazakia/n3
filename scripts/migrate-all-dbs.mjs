import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'supabase', 'migrations');

// Database configurations to migrate
const DATABASES = [
  {
    name: 'Local Supabase (Docker)',
    config: {
      host: '127.0.0.1',
      port: 55322,
      database: 'postgres',
      user: 'postgres',
      password: process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD || 'postgres',
    }
  },
  {
    name: 'Remote Supabase (Production)',
    config: {
      host: 'db.qtkdnpbbukjamqgvbaeh.supabase.co',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: 'Qweasd145698@',
      ssl: { rejectUnauthorized: false }
    }
  }
];

async function migrateDatabase(db) {
  console.log(`\n==================================================`);
  console.log(`⚙️  Starting migration for: ${db.name}`);
  console.log(`   Host: ${db.config.host}:${db.config.port}`);
  console.log(`==================================================`);

  const client = new Client(db.config);
  try {
    await client.connect();
    console.log(`✅ Connected successfully.`);

    // 1. Ensure migrations schema and table exist
    await client.query(`CREATE SCHEMA IF NOT EXISTS supabase_migrations;`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
        version text PRIMARY KEY,
        inserted_at timestamptz DEFAULT now()
      );
    `);

    // 2. Fetch applied migrations
    const appliedRes = await client.query(`
      SELECT version FROM supabase_migrations.schema_migrations ORDER BY version ASC;
    `);
    const appliedVersions = new Set(appliedRes.rows.map(r => r.version));
    console.log(`   Applied migrations in database:`, Array.from(appliedVersions));

    // 3. Scan local migrations directory
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      throw new Error(`Migrations directory not found at ${MIGRATIONS_DIR}`);
    }
    const files = fs.readdirSync(MIGRATIONS_DIR);
    const localMigrations = files
      .map(file => {
        const match = file.match(/^(\d+)(?:_(.+))?\.sql$/);
        if (!match) return null;
        return {
          filename: file,
          version: match[1],
          name: match[2] || '',
          filepath: path.join(MIGRATIONS_DIR, file)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.version.localeCompare(b.version));

    // 4. Determine pending migrations
    const pending = localMigrations.filter(m => !appliedVersions.has(m.version));
    if (pending.length === 0) {
      console.log(`✨ No pending migrations. Database is up to date.`);
      return;
    }

    console.log(`🚀 Found ${pending.length} pending migration(s) to apply.`);

    // 5. Apply pending migrations sequentially
    for (const m of pending) {
      console.log(`   └─ Running ${m.filename}...`);
      const sql = fs.readFileSync(m.filepath, 'utf-8');

      await client.query('BEGIN');
      try {
        // Run migration statement
        await client.query(sql);
        
        // Log migration in tracking table
        await client.query(
          `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1);`,
          [m.version]
        );
        await client.query('COMMIT');
        console.log(`      🎉 Successfully applied.`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`      ❌ Migration failed, transaction rolled back.`);
        throw err;
      }
    }

    // 6. Reload schema cache for PostgREST if it is the remote DB
    if (db.config.host.includes('supabase.co')) {
      console.log(`🔄 Reloading PostgREST schema cache on remote...`);
      await client.query(`NOTIFY pgrst, 'reload schema';`);
      console.log(`   ✅ Cache reloaded.`);
    }

    console.log(`🌟 Migration completed successfully for ${db.name}`);
  } catch (err) {
    console.error(`💥 Error migrating ${db.name}:`, err.message);
    throw err;
  } finally {
    await client.end();
  }
}

async function main() {
  console.log("🎬 Initiating database schema migration for all databases...");
  for (const db of DATABASES) {
    try {
      await migrateDatabase(db);
    } catch (err) {
      console.error(`🛑 Migration stopped due to error on ${db.name}`);
      process.exit(1);
    }
  }
  console.log("\n💯 All database migrations processed successfully!");
}

main().catch(console.error);
