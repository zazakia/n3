import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dbocdelbzirvzdsmmnmt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRib2NkZWxiemlydnpkc21tbm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjM3NjEsImV4cCI6MjA4OTAzOTc2MX0.BlJH1gqfsRRA-aeae0L_Wog06gIZk4Tscwvm3TWsAQs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function trySignUp() {
    const { data, error } = await supabase.auth.signUp({
        email: 'collector@loanbrick.com',
        password: 'password123'
    });
    
    if (error) {
        console.error('Sign Up Failed:', error.message);
    } else {
        console.log('Sign Up SUCCESS:', data.user?.email);
        console.log('User ID:', data.user?.id);
    }
}

trySignUp();
