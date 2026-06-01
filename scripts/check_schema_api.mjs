import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qtkdnpbbukjamqgvbaeh.supabase.co',
  'sb_publishable_YXjolA9mlvLplSA3pY-2FA_b9sJ0PO6'
);

async function check() {
  const { data: b1, error: e1 } = await supabase.from('borrowers').select('*').limit(1);
  console.log('borrowers:', e1 ? e1.message : b1);

  const { data: b2, error: e2 } = await supabase.from('app_borrowers').select('*').limit(1);
  console.log('app_borrowers:', e2 ? e2.message : b2);

  const { data: b3, error: e3 } = await supabase.from('loans').select('*').limit(1);
  console.log('loans:', e3 ? e3.message : b3);

  const { data: b4, error: e4 } = await supabase.from('app_loans').select('*').limit(1);
  console.log('app_loans:', e4 ? e4.message : b4);
}
check().catch(console.error);
