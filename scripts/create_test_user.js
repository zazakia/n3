const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env.local
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createTestUser() {
    const email = 'admin@loanbrick.com';
    const password = 'password123';

    console.log(`Creating/Signing up user: ${email}...`);
    
    // Attempt sign up
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
    });

    if (signUpError) {
        if (signUpError.message.includes('already registered')) {
            console.log('User already registered. Attempting to sign in to get ID...');
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (signInError) {
                console.error('Sign in failed:', signInError.message);
                return;
            }
            updateProfile(signInData.user.id);
        } else {
            console.error('Sign up failed:', signUpError.message);
        }
    } else {
        console.log('Sign up successful! ID:', signUpData.user.id);
        updateProfile(signUpData.user.id);
    }
}

async function updateProfile(authId) {
    console.log(`Updating public.user_profiles for email admin@loanbrick.com with auth_id: ${authId}...`);
    
    // We need service role key to update other profiles if RLS is on, 
    // but since we just signed up, maybe we can update via SQL direct for simplicity
    // Let's print the SQL command the user can run if this fails.
    console.log(`RUN THIS SQL IN DOCKER:`);
    console.log(`docker exec supabase_db_ReactNative-expo-LoanWaterMelon psql -U postgres -d postgres -c "UPDATE public.user_profiles SET id = '${authId}' WHERE email = 'admin@loanbrick.com';"`);
}

createTestUser();
