const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase URL or Anon Key in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createUser() {
  const { data, error } = await supabase.auth.signUp({
    email: 'cybergada@gmail.com',
    password: '12345678',
  });

  if (error) {
    console.error('Error creating user:', error.message);
  } else {
    console.log('User created successfully:', data.user.id);
    console.log('NOTE: If email confirmation is enabled, you still need to confirm it in the Supabase Dashboard.');
    console.log('Now run the SQL script to create the user profile with this ID.');
  }
}

createUser();
