import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dbocdelbzirvzdsmmnmt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRib2NkZWxiemlydnpkc21tbm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjM3NjEsImV4cCI6MjA4OTAzOTc2MX0.BlJH1gqfsRRA-aeae0L_Wog06gIZk4Tscwvm3TWsAQs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
    const { data, error } = await supabase.from('user_profiles').select('*').limit(1);
    if (error) {
        console.error(error);
        return;
    }
    if (data && data.length > 0) {
        console.log('Columns:', Object.keys(data[0]));
    } else {
        console.log('No data found');
    }
}

checkColumns();
