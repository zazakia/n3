require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or Key in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLoans() {
  console.log("Fetching loans...");
  const { data, error } = await supabase.from('loans').select('*').limit(5);
  if (error) {
    console.error("Error fetching loans:", error);
  } else {
    console.log(`Found ${data?.length} loans.`);
    if (data?.length > 0) {
      console.log(JSON.stringify(data[0], null, 2));
    }
  }

  console.log("Fetching loans count...");
  const { count, error: err2 } = await supabase.from('loans').select('*', { count: 'exact', head: true });
  console.log("Total loans in Supabase:", count);
}

checkLoans();
