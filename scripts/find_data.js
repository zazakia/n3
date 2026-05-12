const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function check(url, key) {
  console.log(`Checking ${url}...`);
  const supabase = createClient(url, key);
  const tables = ['loans', 'borrowers', 'app_loans', 'app_borrowers'];
  for (const table of tables) {
    try {
      const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (!error && count !== null) {
        console.log(`  Table ${table} has ${count} rows.`);
      }
    } catch (e) {}
  }
}

const envs = [
  { url: 'https://tkavsythcprbmtunggup.supabase.co', key: 'sb_publishable_kIx0oddu5YwQX4Ox7wB7nQ_4umhYkcm' },
  { url: 'https://dbocdelbzirvzdsmmnmt.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRib2NkZWxiemlydnpkc21tbm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjM3NjEsImV4cCI6MjA4OTAzOTc2MX0.BlJH1gqfsRRA-aeae0L_Wog06gIZk4Tscwvm3TWsAQs' },
  { url: 'https://lqzdvxswpgvhwueleeob.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxemR2eHN3cGd2aHd1ZWxlZW9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NzkzODksImV4cCI6MjA4NTE1NTM4OX0.qYJfgJRT2Y7Y564TTn_5OB4XIdk65bTh8B4BNkFUk_k' }
];

async function run() {
  for (const env of envs) {
    await check(env.url, env.key);
  }
}

run();
