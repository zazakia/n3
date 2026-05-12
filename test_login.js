const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://dbocdelbzirvzdsmmnmt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRib2NkZWxiemlydnpkc21tbm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjM3NjEsImV4cCI6MjA4OTAzOTc2MX0.BlJH1gqfsRRA-aeae0L_Wog06gIZk4Tscwvm3TWsAQs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testLogin() {
    console.log('Testing login for collector1@loanbrick.com...');
    const { data, error } = await supabase.auth.signInWithPassword({
        email: 'collector1@loanbrick.com',
        password: 'password123' 
    });

    if (error) {
        console.error('Login Error:', JSON.stringify(error, null, 2));
    } else {
        console.log('Login Success:', data.user.id);
    }
}

testLogin();
