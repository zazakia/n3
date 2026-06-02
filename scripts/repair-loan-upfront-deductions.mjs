import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

// Parse arguments
const args = process.argv.slice(2);
const target = args.includes('--target') ? args[args.indexOf('--target') + 1] : 'local';
const apply = args.includes('--apply');

// remote config
const REMOTE_CONFIG = {
    url: 'https://qtkdnpbbukjamqgvbaeh.supabase.co',
    key: 'sb_publishable_YXjolA9mlvLplSA3pY-2FA_b9sJ0PO6'
};

async function fetchAndRepairLocal() {
    const client = new pg.Client({
        host: '127.0.0.1',
        port: 55322,
        database: 'postgres',
        user: 'postgres',
        password: 'postgres',
    });

    await client.connect();

    // Fetch loans and borrowers
    const loansRes = await client.query(`
        SELECT id, borrower_id, loan_number, principal_amount, total_amount, insurance_amount, deducted_amount, is_reloan, previous_loan_id, cycle, release_date
        FROM app_loans
        WHERE deleted_at IS NULL
        ORDER BY release_date ASC, loan_number ASC;
    `);

    const borrowersRes = await client.query(`
        SELECT id, full_name FROM app_borrowers WHERE deleted_at IS NULL;
    `);

    const loans = loansRes.rows;
    const borrowers = borrowersRes.rows;
    const borrowerMap = new Map(borrowers.map(b => [b.id, b.full_name]));

    const updates = calculateUpdates(loans, borrowerMap);

    console.log(`📊 Found ${loans.length} total loans in local DB.`);
    console.log(`📊 Found ${updates.length} loans needing repairs in local DB.`);

    if (updates.length === 0) {
        console.log('✅ No repairs needed!');
        await client.end();
        return;
    }

    if (!apply) {
        printSampleChanges(updates);
        await client.end();
        return;
    }

    console.log('\n🚀 Applying repairs to local database...');
    let successCount = 0;
    
    for (const u of updates) {
        await client.query(`
            UPDATE app_loans
            SET deducted_amount = $1,
                cycle = $2,
                is_reloan = $3,
                updated_at = NOW()
            WHERE id = $4;
        `, [u.changes.deducted_amount, u.changes.cycle, u.changes.is_reloan, u.id]);
        successCount++;
    }

    console.log(`\n🎉 Successfully updated ${successCount} loans locally.`);
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log('⚡ Local PostgREST schema reloaded.');
    await client.end();
}

async function fetchAndRepairRemote() {
    const supabase = createClient(REMOTE_CONFIG.url, REMOTE_CONFIG.key);

    console.log('📂 Fetching loans from remote Supabase...');
    const { data: loans, error: loansErr } = await supabase
        .from('app_loans')
        .select('*')
        .is('deleted_at', null)
        .order('release_date', { ascending: true });

    if (loansErr) {
        console.error('❌ Error fetching remote loans:', loansErr);
        process.exit(1);
    }

    console.log('👥 Fetching borrowers from remote Supabase...');
    const { data: borrowers, error: borrowersErr } = await supabase
        .from('app_borrowers')
        .select('id, full_name')
        .is('deleted_at', null);

    if (borrowersErr) {
        console.error('❌ Error fetching remote borrowers:', borrowersErr);
        process.exit(1);
    }

    const borrowerMap = new Map(borrowers.map(b => [b.id, b.full_name]));
    const updates = calculateUpdates(loans, borrowerMap);

    console.log(`📊 Found ${loans.length} total loans in remote DB.`);
    console.log(`📊 Found ${updates.length} loans needing repairs in remote DB.`);

    if (updates.length === 0) {
        console.log('✅ No repairs needed!');
        return;
    }

    if (!apply) {
        printSampleChanges(updates);
        return;
    }

    console.log('\n🚀 Applying repairs to remote Supabase...');
    let successCount = 0;
    let errorCount = 0;

    const CHUNK_SIZE = 50;
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        const chunk = updates.slice(i, i + CHUNK_SIZE);
        
        await Promise.all(chunk.map(async (u) => {
            const { error } = await supabase
                .from('app_loans')
                .update(u.changes)
                .eq('id', u.id);

            if (error) {
                console.error(`❌ Error updating loan ${u.loan_number}:`, error.message);
                errorCount++;
            } else {
                successCount++;
            }
        }));

        process.stdout.write(`   Progress: ${Math.min(i + CHUNK_SIZE, updates.length)}/${updates.length}\r`);
    }

    console.log(`\n\n🎉 Done!`);
    console.log(`   Successful Updates: ${successCount}`);
    console.log(`   Errors:             ${errorCount}`);
}

function calculateUpdates(loans, borrowerMap) {
    const loansByBorrower = {};
    loans.forEach(loan => {
        if (!loansByBorrower[loan.borrower_id]) {
            loansByBorrower[loan.borrower_id] = [];
        }
        loansByBorrower[loan.borrower_id].push(loan);
    });

    const updates = [];

    for (const [borrowerId, bLoans] of Object.entries(loansByBorrower)) {
        const borrowerName = borrowerMap.get(borrowerId) || 'Unknown';

        const loanIds = new Set(bLoans.map(l => l.id));
        const roots = bLoans.filter(l => !l.previous_loan_id || !loanIds.has(l.previous_loan_id));

        roots.forEach(root => {
            let current = root;
            let currentCycle = 1;

            while (current) {
                const expectedIsReloan = currentCycle > 1;
                const expectedDeducted = 0;

                const needsUpdate = 
                    parseFloat(current.deducted_amount || 0) !== expectedDeducted ||
                    current.cycle !== currentCycle ||
                    current.is_reloan !== expectedIsReloan;

                if (needsUpdate) {
                    updates.push({
                        id: current.id,
                        loan_number: current.loan_number,
                        borrower: borrowerName,
                        changes: {
                            deducted_amount: expectedDeducted,
                            cycle: currentCycle,
                            is_reloan: expectedIsReloan,
                            updated_at: new Date().toISOString()
                        },
                        old: {
                            deducted_amount: current.deducted_amount,
                            cycle: current.cycle,
                            is_reloan: current.is_reloan
                        }
                    });
                }

                const next = bLoans.find(l => l.previous_loan_id === current.id);
                current = next;
                currentCycle++;
            }
        });
    }

    return updates;
}

function printSampleChanges(updates) {
    console.log('\n📝 SAMPLE PROPOSED CHANGES (DRY RUN):');
    updates.slice(0, 10).forEach((u, idx) => {
        console.log(`${idx + 1}. Borrower: ${u.borrower} (${u.loan_number})`);
        console.log(`   Deducted:  ₱${u.old.deducted_amount} ➔ ₱${u.changes.deducted_amount}`);
        console.log(`   Cycle:     ${u.old.cycle} ➔ ${u.changes.cycle}`);
        console.log(`   Is Reloan: ${u.old.is_reloan} ➔ ${u.changes.is_reloan}`);
        console.log();
    });

    if (updates.length > 10) {
        console.log(`... and ${updates.length - 10} more proposed updates.`);
    }
    console.log('\n💡 Run with --apply to execute these changes live.');
}

async function main() {
    console.log('╔═══════════════════════════════════════════════════╗');
    console.log('║   REPAIR LOAN UPFRONT DEDUCTIONS & CYCLES         ║');
    console.log('╠═══════════════════════════════════════════════════╣');
    console.log(`║  Target:  ${target.padEnd(40)}║`);
    console.log(`║  Mode:    ${(apply ? '⚠️  LIVE APPLY' : '🔍 DRY RUN (no writes)').padEnd(40)}║`);
    console.log('╚═══════════════════════════════════════════════════╝\n');

    if (target === 'local') {
        await fetchAndRepairLocal();
    } else {
        await fetchAndRepairRemote();
    }
}

main().catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});
