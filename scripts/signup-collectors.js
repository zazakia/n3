const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://dbocdelbzirvzdsmmnmt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRib2NkZWxiemlydnpkc21tbm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjM3NjEsImV4cCI6MjA4OTAzOTc2MX0.BlJH1gqfsRRA-aeae0L_Wog06gIZk4Tscwvm3TWsAQs';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function setupCollectors() {
    const collectors = [
        { email: 'cresencio.junco@loanbrick.com', fullName: 'Cresencio Junco' },
        { email: 'gerald.gera@loanbrick.com', fullName: 'Gerald Gera' }
    ];

    for (const collector of collectors) {
        console.log(`Signing up ${collector.fullName} (${collector.email})...`);
        const { data, error } = await supabase.auth.signUp({
            email: collector.email,
            password: 'password123',
            options: {
                data: {
                    full_name: collector.fullName,
                    role: 'collector'
                }
            }
        });

        if (error) {
            console.error(`Error signing up ${collector.email}:`, error.message);
        } else {
            console.log(`Successfully signed up ${collector.email}. User ID: ${data.user.id}`);
        }
    }
}

setupCollectors();
