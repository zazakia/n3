import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dbocdelbzirvzdsmmnmt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRib2NkZWxiemlydnpkc21tbm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NjM3NjEsImV4cCI6MjA4OTAzOTc2MX0.BlJH1gqfsRRA-aeae0L_Wog06gIZk4Tscwvm3TWsAQs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function linkProfile() {
    // New ID from signUp: bda7165c-c3ec-4088-bd08-0be9b3216217
    const { error } = await supabase
        .from('user_profiles')
        .upsert({
            id: 'bda7165c-c3ec-4088-bd08-0be9b3216217',
            full_name: 'Juan Dela Cruz',
            role: 'collector',
            is_active: true
        });
    
    if (error) {
        console.error('Failed to link profile:', error.message);
    } else {
        console.log('Profile successfully linked for collector@loanbrick.com');
        
        // Let's also delete the old stale profile if it exists
        const { error: delError } = await supabase
            .from('user_profiles')
            .delete()
            .eq('id', '74889c25-f935-43a0-96f3-3398c8c6f376');
        
        if (delError) console.warn('Old profile not deleted (maybe not found):', delError.message);
    }
}

linkProfile();
