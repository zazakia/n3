const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://dbocdelbzirvzdsmmnmt.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRib2NkZWxiemlydnpkc21tbm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjM3NjEsImV4cCI6MjA4OTAzOTc2MX0.BlJH1gqfsRRA-aeae0L_Wog06gIZk4Tscwvm3TWsAQs');

async function checkDeducted() {
  const { data, error } = await supabase
    .from('app_loans')
    .select('id, principal_amount, deducted_amount, is_reloan')
    .gt('deducted_amount', 0);
  
  if (error) console.error(error);
  else console.log(`Loans with deducted_amount > 0: ${data.length}`);
}
checkDeducted();
