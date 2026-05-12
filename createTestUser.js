const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function create() {
  const { data, error } = await supabase.auth.admin.createUser({
    email: 's@c.com',
    password: '12345678',
    email_confirm: true
  });
  if (error) console.error("Error connecting to Supabase Auth:", error);
  else console.log("Success! Created user id:", data.user.id);
}
create();
