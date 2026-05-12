import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dbocdelbzirvzdsmmnmt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRib2NkZWxiemlydnpkc21tbm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjM3NjEsImV4cCI6MjA4OTAzOTc2MX0.BlJH1gqfsRRA-aeae0L_Wog06gIZk4Tscwvm3TWsAQs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testLogins() {
    const users = [
        { email: 'cybergada@gmail.com', password: '12345678' },
        { email: 'admin@loanbrick.com', password: '12345678' },
        { email: 'collector@loanbrick.com', password: '12345678' },
        { email: 'cresencio.junco@loanbrick.com', password: '12345678' },
        { email: 'loan_encoder@loanbrick.com', password: 'password123' },
        { email: 'payment_encoder@loanbrick.com', password: 'password123' },
        { email: 'expenses_encoder@loanbrick.com', password: 'password123' }
    ];

    for (const user of users) {
        console.log(`Testing login for ${user.email}...`);
        const { data, error } = await supabase.auth.signInWithPassword({
            email: user.email,
            password: user.password
        });

        if (error) {
            console.error(`FAILED: ${user.email} - Status: ${error.status} - Message: ${error.message}`);
        } else {
            console.log(`SUCCESS: ${user.email} - User ID: ${data.user?.id}`);
        }
    }
}

testLogins();
