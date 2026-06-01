/**
 * DCM Data Import Script
 * Imports collectors, borrowers, loans, and payments from DCM_DATA_of_Clients_import_ready.xlsx
 * into Supabase app_* tables directly (bypasses WatermelonDB sync).
 *
 * Rules:
 * - One borrower record per unique client name
 * - All loans per borrower imported (reloan chains linked via previous_loan_id)
 * - Only the latest loan per borrower is 'active' (if balance > 0), all prior are 'paid'
 * - All 16,610 payment rows imported as-is
 * - Collector names normalized to 4 canonical names
 *
 * Usage: node scripts/import-dcm-data.mjs
 */

import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EXCEL_FILE = 'DCM_DATA_of_Clients_import_ready.xlsx';
const IMPORT_USER_ID = 'dcm-migration';
const DRY_RUN = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
});

// ── Collector name normalization ──────────────────────────────────────────────
const COLLECTOR_NORM = {
    'Cresencio Junco': 'Cresencio Junco',
    'Cesencio Junco': 'Cresencio Junco',
    'Gerald Gera': 'Gerald Gera',
    'Gerald  Gera': 'Gerald Gera',
    'Gerald gera': 'Gerald Gera',
    'Gera Gerald': 'Gerald Gera',
    'Gera gerald': 'Gerald Gera',
    'Jason Cayanong': 'Jason Cayanong',
    'Jayson Cayanong': 'Jason Cayanong',
    'Bernie Casera': 'Bernie Casera',
};

function normalizeCollector(raw) {
    return COLLECTOR_NORM[raw?.trim()] || (raw?.trim() || 'Unknown');
}

// ── Frequency detection ───────────────────────────────────────────────────────
function getFrequency(sourceBlock) {
    if (sourceBlock?.toLowerCase().includes('weekly')) return 'weekly';
    return 'daily';
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function toISO(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.toISOString();
}

function addDays(dateStr, n) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + n);
    return d.toISOString();
}

function addWeeks(dateStr, n) {
    return addDays(dateStr, n * 7);
}

// ── Loan number generator ─────────────────────────────────────────────────────
function makeLoanNumber(importClientId) {
    return `DCM-${importClientId}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log(`\n=== DCM Import ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'} ===\n`);

    // 1. Read Excel
    const wb = XLSX.readFile(EXCEL_FILE);
    const clients = XLSX.utils.sheet_to_json(wb.Sheets['clients_import'], { defval: '' });
    const paymentsRaw = XLSX.utils.sheet_to_json(wb.Sheets['payments_import'], { defval: '' });

    console.log(`Loaded ${clients.length} client records, ${paymentsRaw.length} payment records`);

    // 2. Build collector map: normalized name → UUID
    const collectorNames = [...new Set(clients.map(r => normalizeCollector(r.collector)))];
    const collectorIdMap = {}; // normalizedName → uuid
    const collectorsToInsert = collectorNames.map(name => {
        const id = randomUUID();
        collectorIdMap[name] = id;
        return {
            id,
            full_name: name,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
    });
    console.log(`Collectors to insert: ${collectorsToInsert.length}`);

    // 3. Build borrower map: client_name → UUID
    // Use the collector from the latest loan for each borrower
    const borrowerLatestLoan = {}; // name → latest client row
    clients.forEach(r => {
        const name = r.client_name?.trim();
        if (!name) return;
        const existing = borrowerLatestLoan[name];
        if (!existing || r.date_release > existing.date_release) {
            borrowerLatestLoan[name] = r;
        }
    });

    const borrowerIdMap = {}; // client_name → uuid
    const borrowersToInsert = Object.entries(borrowerLatestLoan).map(([name, r]) => {
        const id = randomUUID();
        borrowerIdMap[name] = id;
        const collectorName = normalizeCollector(r.collector);
        return {
            id,
            full_name: name,
            address: r.address || null,
            phone: r.cell_number || null,
            co_maker_name: r.co_maker_name || null,
            business: r.business || null,
            collector_id: collectorIdMap[collectorName] || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
    });
    console.log(`Unique borrowers to insert: ${borrowersToInsert.length}`);

    // 4. Build loan records
    // Sort all client rows by borrower name then date_release ascending
    // so we can build reloan chains correctly
    const byBorrower = {}; // name → sorted array of client rows
    clients.forEach(r => {
        const name = r.client_name?.trim();
        if (!name) return;
        if (!byBorrower[name]) byBorrower[name] = [];
        byBorrower[name].push(r);
    });
    Object.values(byBorrower).forEach(arr =>
        arr.sort((a, b) => (a.date_release > b.date_release ? 1 : -1))
    );

    // importClientId → loanId (UUID)
    const loanIdMap = {};
    const loansToInsert = [];
    const schedulesToInsert = [];
    let skippedLoans = 0;

    for (const [borrowerName, loanRows] of Object.entries(byBorrower)) {
        const borrowerId = borrowerIdMap[borrowerName];
        if (!borrowerId) continue;

        for (let i = 0; i < loanRows.length; i++) {
            const r = loanRows[i];
            const releaseISO = toISO(r.date_release);
            if (!releaseISO) {
                console.warn(`  SKIP ${r.import_client_id}: invalid date_release "${r.date_release}"`);
                skippedLoans++;
                continue;
            }

            const loanId = randomUUID();
            loanIdMap[r.import_client_id] = loanId;

            const isLast = i === loanRows.length - 1;
            const balance = Number(r.total_loan_balance) || 0;
            const status = isLast && balance > 0 ? 'active' : 'paid';

            const isReloan = i > 0;
            const prevRow = isReloan ? loanRows[i - 1] : null;
            const previousLoanId = prevRow ? loanIdMap[prevRow.import_client_id] : null;

            const principal = Number(r.loan_amount) || 0;
            const interest = Number(r.interest) || 0;
            const totalAmount = Number(r.total_loan) || (principal + interest);
            const installment = Number(r.daily) || (totalAmount / 40);
            const insurance = Number(r.insurance) || 0;
            const deducted = isReloan ? (Number(r.net_loan) < principal ? principal - Number(r.net_loan) : 0) : 0;
            const frequency = getFrequency(r.source_block);
            const collectorName = normalizeCollector(r.collector);
            const collectorId = collectorIdMap[collectorName] || null;

            // Maturity date: release + 40 days (daily) or release + 40 weeks (weekly)
            const maturityISO = frequency === 'weekly'
                ? addWeeks(releaseISO, 40)
                : addDays(releaseISO, 40);
            const firstPaymentISO = frequency === 'weekly'
                ? addWeeks(releaseISO, 1)
                : addDays(releaseISO, 1);

            loansToInsert.push({
                id: loanId,
                borrower_id: borrowerId,
                loan_number: makeLoanNumber(r.import_client_id),
                principal_amount: principal,
                interest_rate: 24,
                interest_type: 'flat',
                term: 40,
                term_unit: frequency === 'weekly' ? 'weeks' : 'days',
                frequency,
                total_amount: totalAmount,
                installment_amount: installment,
                deposit_amount: 0,
                insurance_amount: insurance,
                release_date: releaseISO,
                first_payment_date: firstPaymentISO,
                maturity_date: maturityISO,
                status,
                is_reloan: isReloan,
                previous_loan_id: previousLoanId || null,
                deducted_amount: deducted,
                encoded_by: IMPORT_USER_ID,
                collector_id: collectorId,
                batch: Number(r.batch) || null,
                cycle: Number(r.cycle) || null,
                interest_amount: interest,
                notes: `DCM import: ${r.source_block}`,
                created_at: releaseISO,
                updated_at: new Date().toISOString(),
            });

            // Generate payment schedules only for active loans
            if (status === 'active') {
                for (let day = 1; day <= 40; day++) {
                    const dueISO = frequency === 'weekly'
                        ? addWeeks(releaseISO, day)
                        : addDays(releaseISO, day);
                    schedulesToInsert.push({
                        id: randomUUID(),
                        loan_id: loanId,
                        due_date: dueISO,
                        scheduled_amount: installment,
                        principal_amount: principal / 40,
                        interest_amount: interest / 40,
                        fees_amount: 0,
                        status: 'pending',
                        created_at: releaseISO,
                        updated_at: new Date().toISOString(),
                    });
                }
            }
        }
    }

    console.log(`Loans to insert: ${loansToInsert.length} (${skippedLoans} skipped)`);
    console.log(`Payment schedules to insert: ${schedulesToInsert.length}`);

    // 5. Build payment records
    const paymentsToInsert = [];
    let skippedPayments = 0;
    paymentsRaw.forEach(p => {
        const loanId = loanIdMap[p.import_client_id];
        if (!loanId) {
            skippedPayments++;
            return;
        }
        const paymentDateISO = toISO(p.payment_date);
        if (!paymentDateISO) {
            skippedPayments++;
            return;
        }
        const amount = Number(p.amount);
        if (!amount || amount <= 0) {
            skippedPayments++;
            return;
        }
        // Get borrower_id from loan
        const loan = loansToInsert.find(l => l.id === loanId);
        paymentsToInsert.push({
            id: randomUUID(),
            loan_id: loanId,
            borrower_id: loan?.borrower_id || null,
            schedule_id: null,
            collector_id: loan?.collector_id || null,
            amount,
            payment_date: paymentDateISO,
            receipt_number: null,
            notes: `DCM import: ${p.source_block} col ${p.source_column}`,
            encoded_at: new Date().toISOString(),
            created_at: paymentDateISO,
            updated_at: new Date().toISOString(),
        });
    });
    console.log(`Payments to insert: ${paymentsToInsert.length} (${skippedPayments} skipped)`);

    // 6. Summary before insert
    console.log('\n── Pre-insert summary ──────────────────────────────────');
    console.log(`  Collectors:         ${collectorsToInsert.length}`);
    console.log(`  Borrowers:          ${borrowersToInsert.length}`);
    console.log(`  Loans:              ${loansToInsert.length}`);
    console.log(`    Active:           ${loansToInsert.filter(l => l.status === 'active').length}`);
    console.log(`    Paid:             ${loansToInsert.filter(l => l.status === 'paid').length}`);
    console.log(`  Schedules:          ${schedulesToInsert.length}`);
    console.log(`  Payments:           ${paymentsToInsert.length}`);
    console.log(`  Payment total:      ₱${paymentsToInsert.reduce((s, p) => s + p.amount, 0).toLocaleString()}`);
    console.log('────────────────────────────────────────────────────────\n');

    if (DRY_RUN) {
        console.log('DRY RUN complete. Pass no --dry-run flag to execute.');
        // Write preview JSON for inspection
        fs.writeFileSync('tmp/dcm-import-preview.json', JSON.stringify({
            collectors: collectorsToInsert,
            borrowers: borrowersToInsert.slice(0, 5),
            loans: loansToInsert.slice(0, 5),
            schedules: schedulesToInsert.slice(0, 5),
            payments: paymentsToInsert.slice(0, 5),
        }, null, 2));
        console.log('Preview written to tmp/dcm-import-preview.json');
        return;
    }

    // 7. Insert in order: collectors → borrowers → loans → schedules → payments
    async function upsertBatch(table, rows, label) {
        const CHUNK = 500;
        let inserted = 0;
        for (let i = 0; i < rows.length; i += CHUNK) {
            const chunk = rows.slice(i, i + CHUNK);
            const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' });
            if (error) {
                console.error(`ERROR inserting ${label} chunk ${i}–${i + CHUNK}:`, error.message);
                throw error;
            }
            inserted += chunk.length;
            process.stdout.write(`\r  ${label}: ${inserted}/${rows.length}`);
        }
        console.log(`\r  ${label}: ${rows.length} ✓`);
    }

    console.log('Inserting...');
    await upsertBatch('app_collectors', collectorsToInsert, 'Collectors');
    await upsertBatch('app_borrowers', borrowersToInsert, 'Borrowers');
    await upsertBatch('app_loans', loansToInsert, 'Loans');
    await upsertBatch('app_payment_schedules', schedulesToInsert, 'Schedules');
    await upsertBatch('app_payments', paymentsToInsert, 'Payments');

    console.log('\n✅ Import complete.');

    // 8. Verification queries
    console.log('\n── Verification ────────────────────────────────────────');
    const checks = [
        { table: 'app_collectors', expected: collectorsToInsert.length },
        { table: 'app_borrowers', expected: borrowersToInsert.length },
        { table: 'app_loans', expected: loansToInsert.length },
        { table: 'app_payment_schedules', expected: schedulesToInsert.length },
        { table: 'app_payments', expected: paymentsToInsert.length },
    ];
    for (const { table, expected } of checks) {
        const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
        const ok = count >= expected ? '✓' : '✗';
        console.log(`  ${ok} ${table}: ${count} (expected ≥ ${expected})`);
    }

    // Check no borrower has >1 active loan
    const { data: activeLoans } = await supabase
        .from('app_loans')
        .select('borrower_id')
        .eq('status', 'active')
        .is('deleted_at', null);
    const activeCounts = {};
    (activeLoans || []).forEach(l => { activeCounts[l.borrower_id] = (activeCounts[l.borrower_id] || 0) + 1; });
    const multiActive = Object.values(activeCounts).filter(c => c > 1).length;
    console.log(`  ${multiActive === 0 ? '✓' : '✗'} Borrowers with >1 active loan: ${multiActive}`);
    console.log('────────────────────────────────────────────────────────\n');
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
