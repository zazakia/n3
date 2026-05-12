import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verifyLogin() {
  const email = 'member.test@loanbrick.com';
  const password = '12345678';

  console.log(`Attempting login for: ${email}`);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('Login failed:', error.message);
    process.exit(1);
  }

  console.log('Login successful!');
  console.log('User ID:', data.user.id);
  console.log('Email Confirmed At:', data.user.email_confirmed_at);

  // Check profile
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (profileError) {
    console.error('Profile check failed:', profileError.message);
  } else {
    console.log('Profile Role:', profile.role);
    console.log('Profile Name:', profile.full_name);
  }
}

verifyLogin().catch(console.error);
