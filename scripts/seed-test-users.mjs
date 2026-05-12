import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env'), override: false });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const usersToCreate = [
  { email: 'admin@loanbrick.com', role: 'admin', name: 'Admin User' },
  { email: 'loan_encoder@loanbrick.com', role: 'loan_encoder', name: 'Loan Encoder' },
  { email: 'payment_encoder@loanbrick.com', role: 'payment_encoder', name: 'Payment Encoder' },
  { email: 'expenses_encoder@loanbrick.com', role: 'expenses_encoder', name: 'Expenses Encoder' },
  { email: 'collector@loanbrick.com', role: 'collector', name: 'Collector User' },
];

async function seedUser(u) {
  console.log(`Checking ${u.email}...`);
  // Try to sign in first to see if they exist
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
     email: u.email,
     password: '12345678'
  });

  let userId = signInData?.user?.id;

  if (!userId) {
    console.log(`${u.email} doesn't exist or wrong password. Try sign up...`);
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: u.email,
      password: '12345678',
      options: { data: { full_name: u.name } }
    });
    
    if (signUpError) {
      console.error(`Error signing up ${u.email}:`, signUpError.message);
      return;
    }
    userId = signUpData?.user?.id;
  }

  if (userId) {
    console.log(`Setting role to ${u.role} for ${u.email} (ID: ${userId})`);
    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert({ id: userId, full_name: u.name, role: u.role, email: u.email, is_active: true });
      
    if (profileError) {
      console.error(`Error updating role for ${u.email}:`, profileError.message);
    } else {
      console.log(`Successfully configured ${u.email}`);
    }
  } else {
    console.error(`Failed to get a user ID for ${u.email}`);
  }
}


async function run() {
  for (const u of usersToCreate) {
    await seedUser(u);
  }
  console.log('Seeding complete.');
}

run();
