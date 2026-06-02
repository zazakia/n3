const { Pool } = require('pg');
const xlsx = require('xlsx');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.SUPABASE_DB_HOST     || '127.0.0.1',
  port:     Number(process.env.SUPABASE_DB_PORT || '55322'),
  database: process.env.SUPABASE_DB_NAME     || 'postgres',
  user:     process.env.SUPABASE_DB_USER     || 'postgres',
  password: process.env.EXPO_PUBLIC_SUPABASE_DB_PASSWORD
         || process.env.SUPABASE_DB_PASSWORD
         || 'postgres',
});

function excelDateToJSDate(serial) {
  if (!serial || isNaN(serial)) return null;
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  
  const fractional_day = serial - Math.floor(serial) + 0.0000001;
  let total_seconds = Math.floor(86400 * fractional_day);
  const seconds = total_seconds % 60;
  total_seconds -= seconds;
  const hours = Math.floor(total_seconds / (60 * 60));
  const minutes = Math.floor(total_seconds / 60) % 60;
  
  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds);
}

function splitName(fullName) {
    if (!fullName) return { first: '', last: '', full: '' };
    const cleanName = fullName.trim();
    if (cleanName.includes(',')) {
        const parts = cleanName.split(',').map(p => p.trim());
        return {
            last: parts[0] || '',
            first: parts[1] || '',
            full: `${parts[1] || ''} ${parts[0] || ''}`.trim().replace(/\s+/g, ' ')
        };
    } else {
        const parts = cleanName.split(/\s+/);
        if (parts.length === 1) return { first: parts[0], last: '', full: parts[0] };
        const last = parts.pop();
        const first = parts.join(' ');
        return {
            first: first,
            last: last,
            full: cleanName
        };
    }
}

async function migrate() {
    const isDryRun = process.argv.includes('--dry-run');
    console.log(`Starting Weekly DCS migration... ${isDryRun ? '(DRY RUN)' : ''}`);
    
    const files = [
        './files (1)/WEEKLY-DCS-angelica.xlsx',
        './files (1)/WEEKLY-DCS-meshelle.xlsx'
    ];

    let allLoansToInsert = [];
    let allBorrowersToCreate = [];
    let allPaymentsToInsert = [];
    let allSavingsToInsert = [];
    let allRolloverPayments = [];

    // Connect to DB
    const client = await pool.connect();

    // 1. Setup collector mapping
    const { rows: existingCollectors } = await client.query('SELECT id, full_name FROM public.app_collectors');
    const collectorMap = {};
    for (const c of existingCollectors) collectorMap[c.full_name.toLowerCase()] = c.id;

    // 2. Setup borrower mapping
    const seenBorrowers = new Map();
    const { rows: dbBorrowers } = await client.query('SELECT id, full_name FROM public.app_borrowers WHERE deleted_at IS NULL');
    if (dbBorrowers) {
        dbBorrowers.forEach(b => seenBorrowers.set(b.full_name.toLowerCase(), b.id));
    }

    // 3. Setup existing loans
    const seenLoans = new Set();
    const existingActiveLoans = new Map();
    const { rows: dbLoans } = await client.query('SELECT id, loan_number, borrower_id, status, release_date FROM public.app_loans WHERE deleted_at IS NULL');
    if (dbLoans) {
        dbLoans.forEach(l => {
            seenLoans.add(l.loan_number);
            if (l.status === 'active') {
                if (!existingActiveLoans.has(l.borrower_id)) existingActiveLoans.set(l.borrower_id, []);
                existingActiveLoans.get(l.borrower_id).push(l);
            }
        });
    }

    let globalLoanCount = 0;

    for (const filepath of files) {
        console.log(`\nProcessing file: ${filepath}`);
        let workbook;
        try {
             workbook = xlsx.read(fs.readFileSync(filepath), { type: 'buffer' });
        } catch (e) {
             console.error(`Failed to read file ${filepath}:`, e.message);
             continue;
        }

        const sheetNames = workbook.SheetNames;
        const weeklySheetName = sheetNames.find(name => name.toLowerCase().includes('weekly'));
        if (!weeklySheetName) {
            console.error('No Weekly sheet found.');
            continue;
        }

        const sheet = workbook.Sheets[weeklySheetName];
        const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        
        // Find main data structures
        const datesRow = rawData[1] || [];
        const subHeaderRow = rawData[2] || [];
        const mainHeaderRow = rawData[3] || [];
        
        // Extract dates mapping dynamically
        const paymentDateMap = []; // { colStart: 25, date: Date, dateIso: string }
        
        let maxLength = 0;
        for (const r of rawData) {
            if (r && r.length > maxLength) maxLength = r.length;
        }

        let lastKnownDate = null;
        for (let c = 25; c < maxLength; c++) {
            if (subHeaderRow[c] && String(subHeaderRow[c]).trim().toLowerCase() === 'prin') {
                let dateObj = null;
                // The date might be at c, c+1, or c-1 depending on Excel merge parsing
                const possibleDateCol = datesRow[c+1] || datesRow[c];
                if (typeof possibleDateCol === 'number') {
                    dateObj = excelDateToJSDate(possibleDateCol);
                    lastKnownDate = dateObj;
                } else if (lastKnownDate) {
                    // Compute missing date by adding 7 days
                    dateObj = new Date(lastKnownDate.getTime() + 7 * 24 * 60 * 60 * 1000);
                    lastKnownDate = dateObj;
                }
                
                if (dateObj) {
                    paymentDateMap.push({
                        colStart: c,
                        date: dateObj,
                        dateIso: dateObj.toISOString()
                    });
                }
            }
        }
        
        console.log(`Extracted ${paymentDateMap.length} payment blocks for sheet.`);

        const rawMeeting = rawData[1] ? rawData[1][0] : '';
        const meetingDayName = String(rawMeeting || '').replace('MEETING', '').replace('Meeting', '').trim() || 'Unknown Day';
        
        const rawGroup = rawData[2] ? rawData[2][0] : '';
        const groupName = String(rawGroup || '').trim() || 'Unknown Group';
        
        console.log(`Sheet Group: ${groupName}, Meeting Day: ${meetingDayName}`);

        // Process rows starting from index 4
        for (let r = 4; r < rawData.length; r++) {
            const row = rawData[r];
            if (!row || row.length === 0) continue;
            
            const clientNameRaw = row[0]?.toString().trim();
            // Skip header/total rows and meeting-day group labels (e.g. 'FRIDAY Meeting', 'Monday Meeting')
            const SKIP_ROW_RE = /^(Name Of Client|Total|Grand Total|Sub.?Total|\s*$)/i;
            const MEETING_DAY_RE = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+Meeting$/i;
            if (!clientNameRaw || SKIP_ROW_RE.test(clientNameRaw) || MEETING_DAY_RE.test(clientNameRaw)) continue;
            
            globalLoanCount++;
            const { first, last, full: clientName } = splitName(clientNameRaw);
            const nameKey = clientName.toLowerCase();

            // Handle Collector mapping dynamically based on column 5
            const collectorNameRaw = row[5]?.toString().trim() || 'Unknown Weekly Collector';
            let collectorId = collectorMap[collectorNameRaw];
            
            if (!collectorId) {
                let coll = existingCollectors?.find(c => c.full_name?.toLowerCase().includes(collectorNameRaw.toLowerCase()));
                if (!coll && !isDryRun) {
                    const newCollId = crypto.randomUUID();
                    await client.query(
                        `INSERT INTO public.app_collectors (id, full_name, is_active, created_at, updated_at)
                         VALUES ($1, $2, true, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
                        [newCollId, collectorNameRaw]
                    );
                    coll = { id: newCollId };
                } else if (!coll && isDryRun) {
                     coll = { id: `dry-run-coll-${collectorNameRaw}` };
                }
                collectorId = coll.id;
                collectorMap[collectorNameRaw] = collectorId;
            }

            let borrowerId;
            if (seenBorrowers.has(nameKey)) {
                borrowerId = seenBorrowers.get(nameKey);
                // Queue for update
                const existingBorrower = allBorrowersToCreate.find(b => b.id === borrowerId);
                if (!existingBorrower) {
                    allBorrowersToCreate.push({
                        id: borrowerId,
                        full_name: clientName,
                        group: groupName,
                        meeting_day: meetingDayName,
                        _isUpdate: true
                    });
                }
            } else {
                const existingQueued = allBorrowersToCreate.find(b => b.full_name.toLowerCase() === nameKey);
                if (existingQueued) {
                    borrowerId = existingQueued.id;
                } else {
                    borrowerId = crypto.randomUUID();
                    allBorrowersToCreate.push({
                        id: borrowerId,
                        full_name: clientName,
                        first_name: first,
                        last_name: last,
                        address: row[1] || null,
                        phone: row[2]?.toString() || null,
                        co_maker_name: row[3] || null,
                        business: row[4] || null,
                        collector_id: collectorId,
                        group: groupName,
                        meeting_day: meetingDayName,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        _isUpdate: false
                    });
                }
                seenBorrowers.set(nameKey, borrowerId);
            }

            // Loan Extraction
            // Column mapping (row 3 header):
            //  col[10] = Loan Amount (principal)
            //  col[11] = Weekly (installment amount = Prin per week)
            //  col[12] = Saving (CBU deposit per week)
            //  col[13] = Insurance (per week)
            //  col[14] = Total loan Payments = Prin+Saving+Ins for ONE week (~₱317 for ₱5000 loan)
            //  col[15] = Net Loan (released to borrower)
            //  col[16] = Interest (total interest for the loan)
            //  col[17] = Running principal balance remaining (NOT total repayable — unreliable/formula-driven)
            //  col[18] = Prin. (principal received so far)
            const loanAmount = parseFloat(row[10]) || 0;
            const netLoan = parseFloat(row[15]) || 0;
            const installmentAmount = parseFloat(row[11]) || 0;  // weekly principal installment
            const depositAmount = parseFloat(row[12]) || 0;       // weekly CBU/savings per week
            const insuranceAmount = parseFloat(row[13]) || 0;     // weekly insurance per week
            const interestAmount = parseFloat(row[16]) || 0;      // total interest charged
            // total_amount = what borrower must repay in total (principal + interest)
            // Computed rather than read from col[17] which is a running balance (unreliable)
            const totalAmount = loanAmount > 0 ? (loanAmount + interestAmount) : 0;
            const deductedAmount = Math.max(0, loanAmount - netLoan);

            
            let releaseDate = row[8] || row[22];
            let maturityDate = row[9];
            
            if (typeof releaseDate === 'number') releaseDate = excelDateToJSDate(releaseDate)?.toISOString();
            else if (typeof releaseDate === 'string' && !isNaN(Date.parse(releaseDate))) releaseDate = new Date(releaseDate).toISOString();
            else releaseDate = null;

            if (typeof maturityDate === 'number') maturityDate = excelDateToJSDate(maturityDate)?.toISOString();
            else if (typeof maturityDate === 'string' && !isNaN(Date.parse(maturityDate))) maturityDate = new Date(maturityDate).toISOString();
            else maturityDate = null;

            // Compute Maturity Date based on Date Release
            const termWeeks = parseInt(row[6]) || 24;
            if (releaseDate) {
                const rDate = new Date(releaseDate);
                const computedMaturity = new Date(rDate.getTime() + termWeeks * 7 * 24 * 60 * 60 * 1000);
                maturityDate = computedMaturity.toISOString();
            }

            // Skip rows with no loan amount — these are barangay/zone/group section headers in the Excel
            // (e.g. 'Damulaan', 'Palanas', 'Zone 1 Baybay', 'GK Village') with all-zero financial columns.
            if (loanAmount === 0) {
                // Decrement counter so loan numbers stay sequential for real rows
                globalLoanCount--;
                continue;
            }

            const loanNumber = `LN-WKLY-${globalLoanCount.toString().padStart(4, '0')}`;
            if (seenLoans.has(loanNumber)) continue;

            // totalAmount = loanAmount + interestAmount (principal + interest = total repayable).
            // accTotal sums principal-only payments (colStart = 'Prin' column per week).
            // A loan is fully paid when principal paid >= total repayable amount.
            // col[colStart]   = Prin (principal paid this week)
            // col[colStart+1] = Deposit/Savings (goes to savings_transactions)
            // col[colStart+2] = Insurance
            // col[colStart+3] = Total (Prin+Saving+Ins combined — not used for loan payments)
            let accTotal = 0;
            for (const map of paymentDateMap) {
                 const prinPaid = parseFloat(row[map.colStart]) || 0;  // principal only
                 accTotal += prinPaid;
            }
            const status = (accTotal >= totalAmount && totalAmount > 0) ? 'paid' : 'active';

            const newLoan = {
                id: crypto.randomUUID(),
                borrower_id: borrowerId,
                loan_number: loanNumber,
                principal_amount: loanAmount,
                interest_rate: loanAmount > 0 ? (interestAmount / loanAmount) * 100 : 0,
                interest_type: 'flat',
                term: parseInt(row[6]) || 24, // default to 24 weeks if missing
                term_unit: 'weeks',
                frequency: 'weekly',
                total_amount: totalAmount,
                installment_amount: installmentAmount,
                deposit_amount: depositAmount,
                insurance_amount: insuranceAmount,
                deducted_amount: deductedAmount,
                release_date: releaseDate,
                maturity_date: maturityDate,
                collector_id: collectorId,
                status: status,
                batch: null,
                cycle: parseInt(row[7]) || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                _rawRow: row, // used later for rollover detection
                _accTotal: accTotal
            };
            allLoansToInsert.push(newLoan);

            // Extract Payments
            for (const map of paymentDateMap) {
                const prin = parseFloat(row[map.colStart]) || 0;
                const deposit = parseFloat(row[map.colStart + 1]) || 0;
                const insurance = parseFloat(row[map.colStart + 2]) || 0;
                const totalPaid = parseFloat(row[map.colStart + 3]) || 0;
                
                // Create payment record using the Total Payment column.
                // The user explicitly requested that the Total column (Prin + Deposit + Insurance)
                // should be recorded as the Total Payment in app_payments.
                if (totalPaid > 0) {
                    allPaymentsToInsert.push({
                        id: crypto.randomUUID(),
                        loan_id: newLoan.id,
                        amount: totalPaid,
                        payment_date: map.dateIso,
                        collector_id: collectorId,
                        notes: 'Weekly Migration',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
                }


                // Create saving transaction if deposit > 0
                if (deposit > 0) {
                    allSavingsToInsert.push({
                        id: crypto.randomUUID(),
                        borrower_id: borrowerId,
                        type: 'deposit',
                        amount: deposit,
                        date: map.dateIso,
                        notes: `Weekly CBU Collection from ${loanNumber}`,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
                }
            }
        }
    }

    // Rollover Detection
    console.log('Detecting loan rollovers...');
    const loansByBorrower = {};
    allLoansToInsert.forEach(l => {
        if (!loansByBorrower[l.borrower_id]) loansByBorrower[l.borrower_id] = [];
        loansByBorrower[l.borrower_id].push(l);
    });
    
    let dbLoansToUpdateToPaid = [];

    for (const borrowerId of Object.keys(loansByBorrower)) {
        const borrowerLoans = loansByBorrower[borrowerId].sort((a, b) => 
            new Date(a.release_date || 0) - new Date(b.release_date || 0)
        );

        for (let i = 1; i < borrowerLoans.length; i++) {
            const currentLoan = borrowerLoans[i];
            const previousLoan = borrowerLoans[i - 1];

            const rawRow = currentLoan._rawRow;
            const netLoanProceeds = parseFloat(rawRow[15]) || 0;
            const previousBalance = Math.max(0, previousLoan.total_amount - previousLoan._accTotal);
            
            const expectedNetIfRollover = currentLoan.principal_amount - previousBalance;
            const diff = Math.abs(expectedNetIfRollover - netLoanProceeds);

            if (diff < 5 || Math.abs(diff - currentLoan.insurance_amount) < 5) {
                if (isDryRun) {
                    console.log(`Rollover detected: ${previousLoan.loan_number} -> ${currentLoan.loan_number} (Diff: ${diff})`);
                }
                previousLoan.status = 'paid';
                currentLoan.is_reloan = true;
                currentLoan.previous_loan_id = previousLoan.id;

                if (previousBalance > 0) {
                    allRolloverPayments.push({
                        id: crypto.randomUUID(),
                        loan_id: previousLoan.id,
                        amount: previousBalance,
                        payment_date: currentLoan.release_date || new Date().toISOString(),
                        collector_id: currentLoan.collector_id,
                        notes: `Rollover clearing from Loan ${currentLoan.loan_number}`,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
                }
            }
        }
        
        // Enforce constraint: only the latest loan can be active
        // Combine DB active loans and new loans for this borrower
        const dbActive = existingActiveLoans.get(borrowerId) || [];
        const allBorrowersLoans = [...borrowerLoans, ...dbActive].sort((a, b) => 
            new Date(a.release_date || 0) - new Date(b.release_date || 0)
        );
        
        for (let i = 0; i < allBorrowersLoans.length - 1; i++) {
            const loan = allBorrowersLoans[i];
            if (loan.status === 'active') {
                if (isDryRun) {
                    console.log(`Forcing loan ${loan.loan_number} to 'paid' to satisfy unique_active_loan_per_borrower`);
                }
                loan.status = 'paid';
                // If it's a DB loan, queue it for update
                if (!loan._rawRow) {
                    dbLoansToUpdateToPaid.push(loan.id);
                }
            }
        }
    }

    if (isDryRun) {
        await client.release();
        await pool.end();
        console.log('\n--- DRY RUN SUMMARY ---');
        console.log(`Borrowers to create: ${allBorrowersToCreate.length}`);
        console.log(`Loans to insert: ${allLoansToInsert.length}`);
        console.log(`Payments to insert: ${allPaymentsToInsert.length}`);
        console.log(`Savings transactions to insert: ${allSavingsToInsert.length}`);
        console.log(`Rollover payments to generate: ${allRolloverPayments.length}`);
        return;
    }

    // Execute Batched Inserts using pg directly (bypasses RLS)
    const borrowersToInsert = allBorrowersToCreate.filter(b => !b._isUpdate).map(({_isUpdate, ...rest}) => rest);
    const borrowersToUpdate = allBorrowersToCreate.filter(b => b._isUpdate).map(({_isUpdate, ...rest}) => rest);

    if (borrowersToInsert.length > 0) {
        console.log(`Inserting ${borrowersToInsert.length} new borrowers...`);
        const CHUNK = 50;
        for (let i = 0; i < borrowersToInsert.length; i += CHUNK) {
            const chunk = borrowersToInsert.slice(i, i + CHUNK);
            const vals = []; const params = []; let pi = 1;
            for (const b of chunk) {
                vals.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},NOW(),NOW())`);
                params.push(b.id, b.full_name, b.first_name||null, b.last_name||null,
                    b.address||null, b.phone||null, b.co_maker_name||null, b.business||null,
                    b.collector_id||null, b.group||null, b.meeting_day||null);
            }
            await client.query(
                `INSERT INTO public.app_borrowers (id,full_name,first_name,last_name,address,phone,co_maker_name,business,collector_id,"group",meeting_day,created_at,updated_at)
                 VALUES ${vals.join(',')} ON CONFLICT (id) DO NOTHING`,
                params
            );
        }
    }

    if (borrowersToUpdate.length > 0) {
        console.log(`Updating ${borrowersToUpdate.length} existing borrowers with group data...`);
        for (const b of borrowersToUpdate) {
            await client.query(
                `UPDATE public.app_borrowers SET "group"=$1, meeting_day=$2, updated_at=NOW() WHERE id=$3`,
                [b.group||null, b.meeting_day||null, b.id]
            );
        }
    }

    if (dbLoansToUpdateToPaid.length > 0) {
        console.log(`Updating ${dbLoansToUpdateToPaid.length} existing DB loans to 'paid' to satisfy constraints...`);
        for (let i = 0; i < dbLoansToUpdateToPaid.length; i += 50) {
            const chunk = dbLoansToUpdateToPaid.slice(i, i + 50);
            const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(',');
            await client.query(`UPDATE public.app_loans SET status='paid', updated_at=NOW() WHERE id IN (${placeholders})`, chunk);
        }
    }

    console.log(`Inserting ${allLoansToInsert.length} loans...`);
    const cleanLoans = allLoansToInsert.map(l => {
        const { _rawRow, _accTotal, ...rest } = l;
        return rest;
    });
    {
        const CHUNK = 50;
        for (let i = 0; i < cleanLoans.length; i += CHUNK) {
            const chunk = cleanLoans.slice(i, i + CHUNK);
            const vals = []; const params = []; let pi = 1;
            for (const l of chunk) {
                vals.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},NOW(),NOW())`);
                params.push(
                    l.id, l.borrower_id, l.loan_number,
                    l.principal_amount||0, l.interest_rate||0, l.interest_type||'flat',
                    l.term||24, l.term_unit||'weeks', l.frequency||'weekly',
                    l.total_amount||0, l.installment_amount||0,
                    l.deposit_amount||0, l.insurance_amount||0, l.deducted_amount||0,
                    l.release_date||null, l.maturity_date||null,
                    l.collector_id||null, l.status||'active',
                    l.cycle||null, l.previous_loan_id||null
                );
            }
            await client.query(
                `INSERT INTO public.app_loans (id,borrower_id,loan_number,principal_amount,interest_rate,interest_type,term,term_unit,frequency,total_amount,installment_amount,deposit_amount,insurance_amount,deducted_amount,release_date,maturity_date,collector_id,status,cycle,previous_loan_id,created_at,updated_at)
                 VALUES ${vals.join(',')} ON CONFLICT (id) DO NOTHING`,
                params
            );
        }
    }

    const totalPaymentsToInsert = [...allPaymentsToInsert, ...allRolloverPayments];
    console.log(`Inserting ${totalPaymentsToInsert.length} payments...`);
    {
        const CHUNK = 50;
        for (let i = 0; i < totalPaymentsToInsert.length; i += CHUNK) {
            const chunk = totalPaymentsToInsert.slice(i, i + CHUNK);
            const vals = []; const params = []; let pi = 1;
            for (const p of chunk) {
                vals.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},NOW(),NOW())`);
                params.push(p.id, p.loan_id, p.amount||0, p.payment_date||null, p.collector_id||null, p.notes||null);
            }
            await client.query(
                `INSERT INTO public.app_payments (id,loan_id,amount,payment_date,collector_id,notes,created_at,updated_at)
                 VALUES ${vals.join(',')} ON CONFLICT (id) DO NOTHING`,
                params
            );
        }
    }

    if (allSavingsToInsert.length > 0) {
        console.log(`Inserting ${allSavingsToInsert.length} savings transactions...`);
        const CHUNK = 50;
        for (let i = 0; i < allSavingsToInsert.length; i += CHUNK) {
            const chunk = allSavingsToInsert.slice(i, i + CHUNK);
            const vals = []; const params = []; let pi = 1;
            for (const s of chunk) {
                vals.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},NOW(),NOW())`);
                params.push(s.id, s.borrower_id, s.type||'deposit', s.amount||0, s.date||null);
            }
            try {
                await client.query(
                    `INSERT INTO public.app_savings_transactions (id,borrower_id,type,amount,date,created_at,updated_at)
                     VALUES ${vals.join(',')} ON CONFLICT (id) DO NOTHING`,
                    params
                );
            } catch (e) {
                console.error('Failed on savings insertion:', e.message);
            }
        }
    }

    await client.query("NOTIFY pgrst, 'reload schema'");
    await client.release();
    await pool.end();

    console.log("\nMigration Complete!");
}

migrate().catch(err => { console.error(err); process.exit(1); });
