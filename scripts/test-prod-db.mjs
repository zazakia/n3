import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qtkdnpbbukjamqgvbaeh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YXjolA9mlvLplSA3pY-2FA_b9sJ0PO6';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testQuery() {
  const { data, error } = await supabase.from('app_borrowers').select('*').limit(5);
  if (error) {
    console.error('Error fetching:', error);
  } else {
    console.log('Fetched borrowers:', data.length);
  }
}

testQuery();
