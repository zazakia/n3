import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabaseUrl = 'https://dbocdelbzirvzdsmmnmt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRib2NkZWxiemlydnpkc21tbW10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjM3NjEsImV4cCI6MjA4OTAzOTc2MX0.BlJH1gqfsRRA-aeae0L_Wog06gIZk4Tscwvm3TWsAQs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function bootstrapData() {
    console.log('🚀 Bootstrapping LoanBrick test data...\n');

    // Step 1: Check existing users
    console.log('📋 Step 1: Checking existing users...');
    const { data: existingUsers, error: checkError } = await supabase
        .from('user_profiles')
        .select('id, full_name, role')
        .limit(10);

    if (checkError) {
        console.error('❌ Error checking users:', checkError.message);
        return;
    }

    console.log(`   ✅ Found ${existingUsers.length} users\n`);
    if (existingUsers.length > 0) {
        console.log('   Existing users:');
        existingUsers.forEach(u => {
            console.log(`     - ${u.full_name} (${u.role})`);
        });
        console.log();
    }

    // Step 2: Create collector user if doesn't exist
    console.log('📋 Step 2: Checking for collector users...');
    const { data: collectors, error: collectorError } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .eq('role', 'collector')
        .limit(1);

    let collectorId;

    if (collectors && collectors.length > 0) {
        console.log(`   ✅ Collector exists: ${collectors[0].full_name}\n`);
        collectorId = collectors[0].id;
    } else {
        console.log('   ❌ No collector found, creating one...');
        const newCollectorId = uuidv4();
        const { data: newCollector, error: createError } = await supabase
            .from('user_profiles')
            .insert([
                {
                    id: newCollectorId,
                    full_name: 'Collector One',
                    email: 'collector1@loanbrick.com',
                    role: 'collector',
                    is_active: true,
                },
            ])
            .select();

        if (createError) {
            console.error('   ❌ Error creating collector:', createError.message);
            return;
        }

        console.log(`   ✅ Created collector: ${newCollector[0].full_name}\n`);
        collectorId = newCollector[0].id;
    }

    // Step 3: Create admin user if doesn't exist
    console.log('📋 Step 3: Checking for admin users...');
    const { data: admins } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .eq('role', 'admin')
        .limit(1);

    let adminId;

    if (admins && admins.length > 0) {
        console.log(`   ✅ Admin exists: ${admins[0].full_name}\n`);
        adminId = admins[0].id;
    } else {
        console.log('   ⚠️  No admin found, creating one...');
        const newAdminId = uuidv4();
        const { data: newAdmin, error: createAdminError } = await supabase
            .from('user_profiles')
            .insert([
                {
                    id: newAdminId,
                    full_name: 'Admin User',
                    email: 'admin@loanbrick.com',
                    role: 'admin',
                    is_active: true,
                },
            ])
            .select();

        if (createAdminError) {
            console.error('   ❌ Error creating admin:', createAdminError.message);
            return;
        }

        console.log(`   ✅ Created admin: ${newAdmin[0].full_name}\n`);
        adminId = newAdmin[0].id;
    }

    // Step 4: Create test borrowers
    console.log('📋 Step 4: Creating test borrowers...');
    const testBorrowers = [
        {
            full_name: 'Juan Dela Cruz',
            phone: '09123456789',
            address: 'Zone 1, Sitio A',
            area: 'Downtown',
            route_index: 1,
            gender: 'male',
            collector_id: collectorId,
            created_by: collectorId,
            notes: 'Test borrower 1',
        },
        {
            full_name: 'Maria Santos',
            phone: '09198765432',
            address: 'Zone 2, Barangay B',
            area: 'Uptown',
            route_index: 2,
            gender: 'female',
            collector_id: collectorId,
            created_by: collectorId,
            notes: 'Test borrower 2',
        },
        {
            full_name: 'Carlos Reyes',
            phone: '09111223344',
            address: 'Zone 3, Street C',
            area: 'Midtown',
            route_index: 3,
            gender: 'male',
            collector_id: collectorId,
            created_by: collectorId,
            notes: 'Test borrower 3',
        },
        {
            full_name: 'Ana Garcia',
            phone: '09155667788',
            address: 'Zone 4, Purok D',
            area: 'Suburb',
            route_index: 4,
            gender: 'female',
            collector_id: collectorId,
            created_by: collectorId,
            notes: 'Test borrower 4',
        },
        {
            full_name: 'Pedro Lopez',
            phone: '09177889900',
            address: 'Zone 5, Sitio E',
            area: 'Rural',
            route_index: 5,
            gender: 'male',
            collector_id: collectorId,
            created_by: collectorId,
            notes: 'Test borrower 5',
        },
    ];

    const { data: borrowers, error: borrowerError } = await supabase
        .from('borrowers')
        .insert(testBorrowers)
        .select();

    if (borrowerError) {
        console.error('   ❌ Error creating borrowers:', borrowerError.message);
        return;
    }

    console.log(`   ✅ Created ${borrowers.length} test borrowers\n`);

    // Summary
    console.log('='.repeat(70));
    console.log('\n✅ BOOTSTRAP COMPLETE!\n');
    console.log('📊 SUMMARY:');
    console.log(`   Collector: ${existingUsers.find(u => u.id === collectorId)?.full_name || 'Collector One'}`);
    console.log(`   Borrowers: ${borrowers.length} created`);
    console.log('\n📝 NEXT STEPS:');
    console.log('   1. Open your Collector Portal');
    console.log('   2. Click "Sync Now"');
    console.log('   3. You should see 5 borrowers in "My Borrowers"\n');
}

bootstrapData().catch(err => console.error('Fatal error:', err));
