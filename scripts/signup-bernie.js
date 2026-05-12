const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://dbocdelbzirvzdsmmnmt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRib2NkZWxiemlydnpkc21tbm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjM3NjEsImV4cCI6MjA4OTAzOTc2MX0.BlJH1gqfsRRA-aeae0L_Wog06gIZk4Tscwvm3TWsAQs';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function setupBernie() {
    console.log('Signing up Bernie Casera (bernie.casera@loanbrick.com)...');
    const { data, error } = await supabase.auth.signUp({
        email: 'bernie.casera@loanbrick.com',
        password: 'password123',
        options: {
            data: {
                full_name: 'Bernie Casera',
                role: 'collector'
            }
        }
    });

    if (error) {
        console.error('Error signing up Bernie:', error.message);
    } else {
        console.log('Successfully signed up Bernie. User ID:', data.user.id);
    }
}

setupBernie();
