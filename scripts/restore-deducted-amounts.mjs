import { createClient } from '@supabase/supabase-js';

const REMOTE_CONFIG = {
    url: 'https://qtkdnpbbukjamqgvbaeh.supabase.co',
    key: 'sb_publishable_YXjolA9mlvLplSA3pY-2FA_b9sJ0PO6'
};

async function fixDeductedAmount() {
    const supabase = createClient(REMOTE_CONFIG.url, REMOTE_CONFIG.key);

    console.log('Fetching loans from Supabase...');
    const { data: loans, error: loansErr } = await supabase
        .from('app_loans')
        .select('*')
        .is('deleted_at', null)
        .order('release_date', { ascending: true });

    if (loansErr) throw loansErr;

    console.log('Fetching payments from Supabase...');
    const { data: payments, error: paysErr } = await supabase
        .from('app_payments')
        .select('*')
        .is('deleted_at', null);

    if (paysErr) throw paysErr;

    const paysByLoan = {};
    for (const p of payments) {
        if (!paysByLoan[p.loan_id]) paysByLoan[p.loan_id] = [];
        paysByLoan[p.loan_id].push(p);
    }

    const loanById = Object.fromEntries(loans.map(l => [l.id, l]));
    const byBorrower = {};
    for (const l of loans) {
        if (!byBorrower[l.borrower_id]) byBorrower[l.borrower_id] = [];
        byBorrower[l.borrower_id].push(l);
    }

    const updates = [];

    for (const bLoans of Object.values(byBorrower)) {
        const idSet = new Set(bLoans.map(l => l.id));
        // Find roots (loans without a previous_loan_id, or where previous_loan_id isn't in this borrower's set)
        const roots = bLoans.filter(l => !l.previous_loan_id || !idSet.has(l.previous_loan_id));
        
        for (const root of roots) {
            let cur = root;
            let cyc = 1;
            while (cur) {
                const expectedIsReloan = cyc > 1;

                let expectedDeducted = 0;
                if (cur.previous_loan_id) {
                    const prev = loanById[cur.previous_loan_id];
                    if (prev) {
                        const prevPays = paysByLoan[prev.id] ?? [];
                        const regularSum = prevPays
                            .filter(p => {
                                const n = (p.notes || '').toLowerCase();
                                return !n.includes('auto-adjustment') && !n.includes('rollover');
                            })
                            .reduce((s, p) => s + Number(p.amount), 0);
                        
                        const prevBalance = Number(prev.total_amount) - regularSum;
                        if (prevBalance > 0.01) {
                            expectedDeducted = Math.round(prevBalance * 100) / 100;
                        }
                    }
                }

                // If currently Deducted Amount doesn't match the Expected, update it
                const needsUpdate = Math.abs(Number(cur.deducted_amount) - expectedDeducted) >= 1;

                if (needsUpdate) {
                    updates.push({
                        id: cur.id,
                        loan_number: cur.loan_number,
                        oldDeducted: cur.deducted_amount,
                        newDeducted: expectedDeducted
                    });
                }

                cur = bLoans.find(l => l.previous_loan_id === cur.id);
                cyc++;
            }
        }
    }

    if (updates.length === 0) {
        console.log('✅ All deduction amounts are already correct!');
        return;
    }

    console.log(`Found ${updates.length} loans to update...`);
    
    let successCount = 0;
    const CHUNK_SIZE = 50;
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        const chunk = updates.slice(i, i + CHUNK_SIZE);
        
        await Promise.all(chunk.map(async (u) => {
            const { error } = await supabase
                .from('app_loans')
                .update({ deducted_amount: u.newDeducted })
                .eq('id', u.id);

            if (error) {
                console.error(`❌ Error updating loan ${u.loan_number}:`, error.message);
            } else {
                successCount++;
            }
        }));

        process.stdout.write(`   Progress: ${Math.min(i + CHUNK_SIZE, updates.length)}/${updates.length}\r`);
    }

    console.log(`\n🎉 Done! Successfully updated ${successCount} loans.`);
}

fixDeductedAmount().catch(console.error);
