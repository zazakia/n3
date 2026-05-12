const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://dbocdelbzirvzdsmmnmt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRib2NkZWxiemlydnpkc21tbm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjM3NjEsImV4cCI6MjA4OTAzOTc2MX0.BlJH1gqfsRRA-aeae0L_Wog06gIZk4Tscwvm3TWsAQs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function forceSyncUpdate() {
    console.log('Signing in as collector2@loanbrick.com...');
    await supabase.auth.signInWithPassword({
        email: 'collector2@loanbrick.com',
        password: '12345678'
    });

    const now = new Date().toISOString();
    console.log(`Updating all records with updated_at = ${now}...`);

    const { error: e1 } = await supabase.from('borrowers').update({ updated_at: now }).neq('id', 'void');
    if (e1) console.error('Error updating borrowers:', e1.message);
    else console.log('Updated borrowers.');

    const { error: e2 } = await supabase.from('loans').update({ updated_at: now }).neq('id', 'void');
    if (e2) console.error('Error updating loans:', e2.message);
    else console.log('Updated loans.');

    const { error: e3 } = await supabase.from('payment_schedules').update({ updated_at: now }).neq('id', 'void');
    if (e3) console.error('Error updating schedules:', e3.message);
    else console.log('Updated schedules.');
}

forceSyncUpdate();
