import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dbocdelbzirvzdsmmnmt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRib2NkZWxiemlydnpkc21tbm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjM3NjEsImV4cCI6MjA4OTAzOTc2MX0.BlJH1gqfsRRA-aeae0L_Wog06gIZk4Tscwvm3TWsAQs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBorrowers() {
    console.log('📋 Fetching all borrowers...\n');
    
    const { data: borrowers, error } = await supabase
        .from('borrowers')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('❌ Error fetching borrowers:', error);
        return;
    }

    console.log(`✅ Found ${borrowers.length} borrowers\n`);
    console.log('='.repeat(80));

    // Check for foreign key issues
    const issues = {
        missingCollectorId: [],
        missingCreatedBy: [],
        nullCreatedBy: [],
        totalRecords: borrowers.length,
    };

    borrowers.forEach(b => {
        if (!b.collector_id) issues.missingCollectorId.push(b.id);
        if (!b.created_by) issues.missingCreatedBy.push(b.id);
        if (b.created_by === null) issues.nullCreatedBy.push(b.id);
    });

    // Print summary
    console.log('\n📊 INTEGRITY CHECK:');
    console.log(`   ✅ Total: ${issues.totalRecords}`);
    console.log(`   ⚠️  Missing collector_id: ${issues.missingCollectorId.length}`);
    console.log(`   ⚠️  Missing created_by: ${issues.missingCreatedBy.length}`);
    console.log(`   ❌ NULL created_by: ${issues.nullCreatedBy.length}`);

    if (issues.missingCollectorId.length > 0) {
        console.log(`\n   IDs with missing collector_id:`);
        issues.missingCollectorId.slice(0, 5).forEach(id => console.log(`     - ${id}`));
        if (issues.missingCollectorId.length > 5) {
            console.log(`     ... and ${issues.missingCollectorId.length - 5} more`);
        }
    }

    if (issues.nullCreatedBy.length > 0) {
        console.log(`\n   ❌ IDs with NULL created_by (WILL FAIL FK CONSTRAINT):`);
        issues.nullCreatedBy.slice(0, 5).forEach(id => console.log(`     - ${id}`));
        if (issues.nullCreatedBy.length > 5) {
            console.log(`     ... and ${issues.nullCreatedBy.length - 5} more`);
        }
    }

    // Print detailed data
    console.log('\n' + '='.repeat(80));
    console.log('\n📝 DETAIL VIEW (Last 5 records):\n');
    borrowers.slice(0, 5).forEach((b, idx) => {
        console.log(`${idx + 1}. ${b.full_name}`);
        console.log(`   ID: ${b.id}`);
        console.log(`   collector_id: ${b.collector_id || '❌ NULL'}`);
        console.log(`   created_by: ${b.created_by || '❌ NULL'}`);
        console.log(`   phone: ${b.phone || 'N/A'}`);
        console.log(`   area: ${b.area || 'N/A'}`);
        console.log(`   created_at: ${b.created_at}`);
        console.log();
    });

    // Full JSON output
    console.log('='.repeat(80));
    console.log('\n📄 FULL DATA:\n');
    console.log(JSON.stringify(borrowers, null, 2));
}

checkBorrowers();
