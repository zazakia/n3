import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dbocdelbzirvzdsmmnmt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRib2NkZWxiemlydnpkc21tbm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjM3NjEsImV4cCI6MjA4OTAzOTc2MX0.BlJH1gqfsRRA-aeae0L_Wog06gIZk4Tscwvm3TWsAQs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function authAndLink() {
    // 1. Sign In
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: 'collector@loanbrick.com',
        password: 'password123'
    });
    
    if (authError) {
        console.error('Sign In Failed:', authError.message);
        return;
    }
    
    console.log('Signed in as:', authData.user.id);
    
    // 2. Update Profile with SESSION
    const { error: profileError } = await supabase
        .from('user_profiles')
        .upsert({
            id: authData.user.id,
            full_name: 'Juan Dela Cruz',
            role: 'collector',
            is_active: true
        });
    
    if (profileError) {
        console.error('Failed to link profile after login:', profileError.message);
    } else {
        console.log('Profile successfully linked after login!');
    }
}

authAndLink();
