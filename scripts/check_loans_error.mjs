import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qtkdnpbbukjamqgvbaeh.supabase.co',
  'sb_publishable_YXjolA9mlvLplSA3pY-2FA_b9sJ0PO6'
);

async function check() {
    const { data: borrowers, error } = await supabase
      .from('app_borrowers')
      .select('*')
      .ilike('full_name', '%Matuguina%');
    
    if (error) console.error(error);
    
    for (const b of borrowers || []) {
       console.log('Borrower:', b.full_name, b.id);
       const { data: loans, error: err2 } = await supabase
         .from('app_loans')
         .select('*')
         .eq('borrower_id', b.id);
       console.log('Loans:', err2 ? err2 : loans);
       
       const { data: pay, error: err3 } = await supabase
         .from('app_payments')
         .select('*')
         .limit(1);
       console.log('Payments table exists:', err3 ? err3.message : 'Yes');
    }
}

check().catch(console.error);
