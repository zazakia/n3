import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const { Client } = pg;

async function fixSchema() {
  const client = new Client({
    host: process.env.SUPABASE_DB_HOST || '127.0.0.1',
    port: Number(process.env.SUPABASE_DB_PORT || '55322'),
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    user: process.env.SUPABASE_DB_USER || 'postgres',
    password: process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD || 'postgres',
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // 1. Add is_active column if missing
    console.log('Checking for is_active column in app_borrowers...');
    const colCheck = await client.query(`
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'app_borrowers' AND column_name = 'is_active'
    `);
    if (colCheck.rowCount === 0) {
      await client.query('ALTER TABLE app_borrowers ADD COLUMN is_active boolean DEFAULT true');
      console.log('   ✅ Added is_active column');
    } else {
      console.log('   ✓ is_active column already exists');
    }

    // 2. Fix RLS for local dev
    console.log('Applying RLS fix for local development...');
    const rlsSql = `
      DO $$ 
      DECLARE 
          t text;
      BEGIN 
          FOR t IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP 
              EXECUTE 'DROP POLICY IF EXISTS authenticated_full_access ON public.' || quote_ident(t);
              EXECUTE 'DROP POLICY IF EXISTS anon_full_access ON public.' || quote_ident(t);
              EXECUTE 'CREATE POLICY authenticated_full_access ON public.' || quote_ident(t) || ' FOR ALL TO authenticated USING (true);';
              EXECUTE 'CREATE POLICY anon_full_access ON public.' || quote_ident(t) || ' FOR ALL TO anon USING (true);';
              EXECUTE 'ALTER TABLE public.' || quote_ident(t) || ' ENABLE ROW LEVEL SECURITY;';
          END LOOP; 
      END $$;
    `;
    await client.query(rlsSql);
    console.log('   ✅ RLS policies relaxed');

    // 3. Grant Permissions
    console.log('Granting permissions on all public tables...');
    const grantSql = `
      DO $$ 
      DECLARE 
          t text;
      BEGIN 
          FOR t IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP 
              EXECUTE 'GRANT ALL ON public.' || quote_ident(t) || ' TO authenticated;';
              EXECUTE 'GRANT ALL ON public.' || quote_ident(t) || ' TO anon;';
              EXECUTE 'GRANT ALL ON public.' || quote_ident(t) || ' TO service_role;';
          END LOOP; 
      END $$;
    `;
    await client.query(grantSql);
    console.log('   ✅ Permissions granted');

    // 4. Reload Cache
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('   ✅ PostgREST schema cache reloaded');

  } catch (err) {
    console.error('Error fixing schema:', err);
  } finally {
    await client.end();
  }
}

fixSchema();
