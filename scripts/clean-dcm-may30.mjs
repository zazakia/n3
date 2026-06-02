#!/usr/bin/env node
/**
 * clean-dcm-may30.mjs
 *
 * Reads DCM-as-of-May-30.xlsx (sheet "DATA of Clients"), parses its 51
 * batch sections, cleans/normalises names & collectors, and writes:
 *   - migration-data/borrowers.json
 *   - migration-data/loans.json
 *   - migration-data/payments.json
 *   - migration-data/summary.json
 *
 * Usage:  node scripts/clean-dcm-may30.mjs
 */

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── paths ────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const EXCEL_PATH  = path.resolve(__dirname, '..', 'files (1)', 'DCM-as-of-May-30.xlsx');
const OUTPUT_DIR  = path.resolve(__dirname, 'migration-data');

// ── collector normalisation ─────────────────────────────────────────────────
const COLLECTOR_NORMALIZE = {
  'cesencio junco':   'Cresencio Junco',
  'cresencio junco':  'Cresencio Junco',
  'jayson cayanong':  'Jason Cayanong',
  'jason cayanong':   'Jason Cayanong',
  'gerald gera':      'Gerald Gera',
  'gerald  gera':     'Gerald Gera',   // double space variant
  'gera gerald':      'Gerald Gera',
  'bernie casera':    'Bernie Casera',
  'office':           'Office',
};

// ── name normalisation for typos ────────────────────────────────────────────
const NAME_NORMALIZE = {
  'miraluna p. manoza': 'miraluna p. mañoza',
  'denaro a. manlucot': 'genaro a. manlucot',
  'lorena cagabhion malayan': 'lorina cagabhion malayan',
};

/** Normalise a collector name (case-insensitive, collapse spaces). */
function normalizeCollector(raw) {
  if (!raw) return null;
  const key = String(raw).trim().replace(/\s+/g, ' ').toLowerCase();
  if (COLLECTOR_NORMALIZE[key]) return COLLECTOR_NORMALIZE[key];
  // Title-case fallback
  return key.replace(/\b\w/g, c => c.toUpperCase());
}

// ── date helpers ────────────────────────────────────────────────────────────
/**
 * Convert an Excel serial-date number to ISO-8601 date string (YYYY-MM-DD).
 * Returns null for invalid / missing values.
 */
function excelSerialToISO(serial) {
  if (!serial) return null;
  if (typeof serial === 'number') {
    const jsDate = new Date((serial - 25569) * 86400 * 1000);
    return jsDate.toISOString().split('T')[0];
  }
  if (typeof serial === 'string') {
    const parsed = new Date(serial);
    if (!isNaN(parsed)) {
      return parsed.toISOString().split('T')[0];
    }
  }
  return null;
}

function addDaysUTC(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function isSundayPHPUTC(date) {
  const phpTime = new Date(date.getTime() + (8 * 60 * 60 * 1000));
  return phpTime.getUTCDay() === 0;
}

function skipSundayUTC(date) {
  if (isSundayPHPUTC(date)) {
    return addDaysUTC(date, 1);
  }
  return date;
}

function firstPaymentDateUTC(releaseDate) {
  const next = addDaysUTC(releaseDate, 1);
  return skipSundayUTC(next);
}

function addFrequencySkipSundayUTC(date, frequency) {
  let next;
  switch (frequency) {
    case 'daily':
      next = addDaysUTC(date, 1);
      if (isSundayPHPUTC(next)) next = addDaysUTC(next, 1);
      return next;
    default:
      next = addDaysUTC(date, 1);
      if (isSundayPHPUTC(next)) next = addDaysUTC(next, 1);
      return next;
  }
}

function computeMaturityDateAndSchedules(releaseDateStr, termDays, dailyInstallment) {
  if (!releaseDateStr) return { maturityDate: null, schedules: [] };
  
  const releaseDate = new Date(releaseDateStr + 'T00:00:00Z');
  const fpDate = firstPaymentDateUTC(releaseDate);
  
  const schedules = [];
  let currentDate = new Date(fpDate.getTime());
  
  for (let i = 1; i <= termDays; i++) {
    schedules.push({
      number: i,
      dueDate: currentDate.toISOString().slice(0, 10),
      scheduledAmount: dailyInstallment,
    });
    currentDate = addFrequencySkipSundayUTC(currentDate, 'daily');
  }
  
  const maturityDate = schedules.length > 0 ? schedules[schedules.length - 1].dueDate : releaseDateStr;
  
  return {
    firstPaymentDate: fpDate.toISOString().slice(0, 10),
    maturityDate,
    schedules,
  };
}

// ── name helpers ────────────────────────────────────────────────────────────
const SKIP_NAME_RE = /^(Total|Grand|Sum|Overall|Batch|Name Of Client)/i;

/** Clean a raw name string; returns null if it should be skipped. */
function cleanName(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim().replace(/\s+/g, ' ');
  if (!trimmed || SKIP_NAME_RE.test(trimmed)) return null;
  
  const lower = trimmed.toLowerCase();
  if (NAME_NORMALIZE[lower]) {
    // Return corrected name with Title Case
    return NAME_NORMALIZE[lower].replace(/\b\w/g, c => c.toUpperCase());
  }
  
  return trimmed;
}

/**
 * Split a full name into first_name / last_name.
 *   - "Last, First" → first = First, last = Last
 *   - "First Middle Last" → first = "First Middle", last = "Last"
 */
function splitName(fullName) {
  if (!fullName) return { first_name: '', last_name: '' };
  if (fullName.includes(',')) {
    const [last, ...rest] = fullName.split(',').map(s => s.trim());
    return { first_name: rest.join(' ').trim(), last_name: last };
  }
  const parts = fullName.split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  const last  = parts.pop();
  const first = parts.join(' ');
  return { first_name: first, last_name: last };
}

/** Generate a URL-safe slug ref_id from a name. */
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Clean a phone number: remove leading 0, strip N/A, return null if empty. */
function cleanPhone(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (/^n\/?a$/i.test(s) || s === '0' || s === '') return null;
  // Remove non-digit chars (except leading +)
  s = s.replace(/[^0-9]/g, '');
  if (s.startsWith('0')) s = s.slice(1);
  return s || null;
}

/** Safely parse a numeric value, returning 0 for non-numeric. */
function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

// ── main ────────────────────────────────────────────────────────────────────
function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  DCM May-30 Cleaner → JSON                         ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\n📂 Reading: ${EXCEL_PATH}`);

  if (!fs.existsSync(EXCEL_PATH)) {
    console.error(`❌ File not found: ${EXCEL_PATH}`);
    process.exit(1);
  }

  // ── 1. Read entire sheet as array-of-arrays ───────────────────────────
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheet    = workbook.Sheets['DATA of Clients'];
  if (!sheet) {
    console.error('❌ Sheet "DATA of Clients" not found');
    process.exit(1);
  }

  // header:1 → first element is header row; raw data keeps numbers as-is
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  console.log(`   Total rows in sheet: ${rows.length}`);

  // ── 2. Find all header rows (col A = 'Name Of Client') ───────────────
  const headerRowIndices = [];
  for (let i = 0; i < rows.length; i++) {
    const cellA = rows[i]?.[0];
    if (cellA && String(cellA).trim() === 'Name Of Client') {
      headerRowIndices.push(i);
    }
  }
  console.log(`   Found ${headerRowIndices.length} section header rows: ${headerRowIndices.map(i => i + 1).join(', ')}`);

  // ── 3. Parse each section ─────────────────────────────────────────────
  const allLoans    = [];  // raw parsed loan objects
  const allPayments = [];  // raw payment records

  for (let si = 0; si < headerRowIndices.length; si++) {
    const hIdx = headerRowIndices[si];
    const nextHIdx = si + 1 < headerRowIndices.length
      ? headerRowIndices[si + 1]
      : rows.length;

    // 3a. Detect batch label from rows above (scan -1, -2)
    let batchLabel = null;
    for (let offset = 1; offset <= 3; offset++) {
      const probe = hIdx - offset;
      if (probe < 0) continue;
      const val = rows[probe]?.[0];
      if (val) {
        const m = String(val).match(/Batch\s+(\d+)/i);
        if (m) { batchLabel = parseInt(m[1], 10); break; }
      }
    }

    // 3b. Extract payment date columns from the header row
    const headerRow     = rows[hIdx];
    const dateColumns   = []; // { colIdx, isoDate }
    // Scan up to col 100 (which safely covers col CA)
    for (let c = 19; c <= 100; c++) {
      const val = headerRow ? headerRow[c] : null;
      if (val && typeof val === 'number' && val > 1) {
        const iso = excelSerialToISO(val);
        if (iso) dateColumns.push({ colIdx: c, isoDate: iso });
      }
    }

    console.log(`\n── Section ${si + 1}  (header row ${hIdx + 1})  Batch=${batchLabel ?? '?'}  dateCols=${dateColumns.length}`);

    // 3c. Parse data rows below the header until next section
    let dataRowCount = 0;
    for (let r = hIdx + 1; r < nextHIdx; r++) {
      const row = rows[r];
      if (!row) continue;

      const rawName = cleanName(row[0]);
      if (!rawName) continue; // skip totals, blanks, sub-headers

      const collector  = normalizeCollector(row[5]);
      const batch      = parseInt(row[7]) || batchLabel || null;
      const cycle      = parseInt(row[8]) || null;
      const days       = parseInt(row[6]) || 40;

      let releaseDate = excelSerialToISO(row[9]);
      let endDate     = excelSerialToISO(row[10]);
      
      // Fix Excel typos where 2016 was entered instead of 2026 (e.g. 42470 instead of 46130)
      if (releaseDate && (releaseDate.startsWith('2016-') || releaseDate > '2026-05-31')) {
        const endSerial = num(row[10]);
        if (endSerial > 45000) {
          releaseDate = excelSerialToISO(endSerial - days);
        }
      }

      // Fix maturity date earlier than release date typos (Excel DD/MM/YYYY vs MM/DD/YYYY parsing issues)
      if (releaseDate && endDate && endDate < releaseDate) {
        // 1. Month/Day swaps (e.g., July 12 2025 -> December 7 2025)
        const [y, m, d] = endDate.split('-').map(Number);
        if (m <= 12 && d <= 12) {
          const swappedDateStr = `${y}-${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`;
          if (swappedDateStr >= releaseDate) {
            console.log(`   [Date Auto-Correct] Row ${r + 1} (${rawName}) Month/Day Swap: ${endDate} ➔ ${swappedDateStr}`);
            endDate = swappedDateStr;
          }
        }

        // 2. Off-by-one-year typos (e.g., Feb 17 2025 -> Feb 17 2026 for Dec 2025 loans)
        if (endDate < releaseDate) {
          const [y, m, d] = endDate.split('-').map(Number);
          const plusOneYearStr = `${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          if (plusOneYearStr >= releaseDate) {
            console.log(`   [Date Auto-Correct] Row ${r + 1} (${rawName}) Year +1: ${endDate} ➔ ${plusOneYearStr}`);
            endDate = plusOneYearStr;
          }
        }
      }

      const loanAmount       = num(row[11]);
      const dailyInstallment = num(row[12]);
      const interest         = num(row[13]);
      const totalPayment     = num(row[14]);
      const netLoan          = num(row[15]);
      const insurance        = num(row[16]);
      const totalLoan        = num(row[17]);
      const totalLoanBalance = num(row[18]);

      // Recompute Maturity Date programmatically based on releaseDate and terms (days), skipping Sundays
      if (releaseDate) {
        const calc = computeMaturityDateAndSchedules(releaseDate, days, dailyInstallment);
        if (calc.maturityDate) {
          endDate = calc.maturityDate;
        }
      }

      // Determine status
      let status;
      if (loanAmount === 0) {
        status = 'unknown';
      } else if (totalLoanBalance <= 0) {
        status = 'paid';
      } else {
        status = 'active';
      }

      const fullName  = rawName;
      const nameSlug  = slugify(fullName);
      const batchStr  = batch != null ? `b${batch}` : 'b0';
      const cycleStr  = cycle != null ? `c${cycle}` : 'c0';
      const loanRefId = `loan-${nameSlug}-${batchStr}-${cycleStr}-r${r}`;

      const loanRecord = {
        ref_id:             loanRefId,
        borrower_ref:       `borrower-${nameSlug}`,
        _full_name:         fullName,          // temporary, for borrower dedup
        _address:           row[1] ? String(row[1]).trim() : null,
        _phone:             cleanPhone(row[2]),
        _business:          row[4] ? String(row[4]).trim() : null,
        _co_maker_name:     row[3] ? String(row[3]).trim() : null,
        collector:          collector,
        batch:              batch,
        cycle:              cycle,
        days:               days,
        release_date:       releaseDate,
        end_date:           endDate,
        loan_amount:        loanAmount,
        daily_installment:  dailyInstallment,
        interest:           interest,
        total_payment:      totalPayment,
        net_loan:           netLoan,
        insurance:          insurance,
        total_loan:         totalLoan,
        total_loan_balance: totalLoanBalance,
        status:             status,
        previous_loan_ref:  null,
        is_reloan:          false,
        source_row:         r + 1,  // 1-indexed for human readability
      };

      allLoans.push(loanRecord);
      dataRowCount++;

      // 3d. Extract payments from the section's date columns
      for (const dc of dateColumns) {
        const amt = num(row[dc.colIdx]);
        if (amt > 0) {
          allPayments.push({
            loan_ref:     loanRefId,
            borrower_ref: `borrower-${nameSlug}`,
            amount:       amt,
            payment_date: dc.isoDate,
            collector:    collector,
          });
        }
      }
    }
    console.log(`   → ${dataRowCount} client rows parsed, ${allPayments.length} cumulative payments`);
  }

  console.log(`\n✅ Parsing complete: ${allLoans.length} loans, ${allPayments.length} payments`);

  // ── 4. Deduplicate borrowers ──────────────────────────────────────────
  const borrowerMap = new Map(); // slug → borrower record

  for (const loan of allLoans) {
    const slug = loan.borrower_ref.replace(/^borrower-/, '');
    if (!borrowerMap.has(slug)) {
      const { first_name, last_name } = splitName(loan._full_name);
      borrowerMap.set(slug, {
        ref_id:        `borrower-${slug}`,
        full_name:     loan._full_name,
        first_name,
        last_name,
        address:       loan._address,
        phone:         loan._phone,
        business:      loan._business,
        co_maker_name: loan._co_maker_name,
        collector:     loan.collector,
        loan_count:    0,
      });
    }
    borrowerMap.get(slug).loan_count++;
  }

  const borrowers = [...borrowerMap.values()];
  console.log(`   Unique borrowers: ${borrowers.length}`);

  // ── 5. Reloan linking ─────────────────────────────────────────────────
  // Group loans by borrower_ref, sort by release_date, link reloans
  const loansByBorrower = new Map();
  for (const loan of allLoans) {
    if (!loansByBorrower.has(loan.borrower_ref)) {
      loansByBorrower.set(loan.borrower_ref, []);
    }
    loansByBorrower.get(loan.borrower_ref).push(loan);
  }

  let reloanCount = 0;
  for (const [, loans] of loansByBorrower) {
    if (loans.length < 2) continue;
    // Sort by release date (nulls first)
    loans.sort((a, b) => {
      if (!a.release_date && !b.release_date) return 0;
      if (!a.release_date) return -1;
      if (!b.release_date) return 1;
      return a.release_date.localeCompare(b.release_date);
    });
    for (let i = 1; i < loans.length; i++) {
      loans[i].previous_loan_ref = loans[i - 1].ref_id;
      loans[i].is_reloan = true;
      // Force the previous loan to be 'paid'
      loans[i - 1].status = 'paid';
      
      const rolloverAmt = loans[i - 1].total_loan_balance;
      if (rolloverAmt > 0) {
        const payDate = loans[i].release_date || loans[i - 1].end_date || '2026-05-30';
        allPayments.push({
          loan_ref: loans[i - 1].ref_id,
          borrower_ref: loans[i - 1].borrower_ref,
          amount: rolloverAmt,
          payment_date: payDate,
          collector: loans[i - 1].collector,
          notes: 'Rollover payment to new loan'
        });
        // Now that it's paid off via rollover, the expected outstanding balance is 0
        loans[i - 1].total_loan_balance = 0;
      }
      
      reloanCount++;
    }
  }
  console.log(`   Reloans linked: ${reloanCount}`);

  // ── 6. Clean loan records (remove temporary _ fields) ─────────────────
  const cleanLoans = allLoans.map(l => {
    const { _full_name, _address, _phone, _business, _co_maker_name, ...rest } = l;
    return rest;
  });

  // ── 7. Write output ───────────────────────────────────────────────────
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const writePrettyJSON = (filename, data) => {
    const filepath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`   📄 ${filename} → ${Array.isArray(data) ? data.length + ' records' : 'object'}`);
  };

  writePrettyJSON('borrowers.json', borrowers);
  writePrettyJSON('loans.json', cleanLoans);
  writePrettyJSON('payments.json', allPayments);

  // ── 8. Summary ────────────────────────────────────────────────────────
  const collectorsSet = new Set();
  const batchesSet    = new Set();

  for (const loan of cleanLoans) {
    if (loan.collector) collectorsSet.add(loan.collector);
    if (loan.batch != null) batchesSet.add(loan.batch);
  }

  const summary = {
    total_borrowers:          borrowers.length,
    total_loans:              cleanLoans.length,
    total_payments:           allPayments.length,
    total_principal:          cleanLoans.reduce((s, l) => s + l.loan_amount, 0),
    total_loan_with_interest: cleanLoans.reduce((s, l) => s + l.total_loan, 0),
    total_payment_amount:     cleanLoans.reduce((s, l) => s + l.total_payment, 0),
    total_outstanding_balance: cleanLoans.reduce((s, l) => s + l.total_loan_balance, 0),
    collectors:               [...collectorsSet].sort(),
    batches:                  [...batchesSet].sort((a, b) => a - b),
    generated_at:             new Date().toISOString(),
  };

  writePrettyJSON('summary.json', summary);

  // ── 9. Print summary table ────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║                   SUMMARY                           ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Borrowers:          ${String(summary.total_borrowers).padStart(8)}                    ║`);
  console.log(`║  Loans:              ${String(summary.total_loans).padStart(8)}                    ║`);
  console.log(`║  Payments:           ${String(summary.total_payments).padStart(8)}                    ║`);
  console.log(`║  Total Principal:  ₱${String(summary.total_principal.toLocaleString()).padStart(12)}                ║`);
  console.log(`║  Total w/ Interest:₱${String(summary.total_loan_with_interest.toLocaleString()).padStart(12)}                ║`);
  console.log(`║  Total Paid:       ₱${String(summary.total_payment_amount.toLocaleString()).padStart(12)}                ║`);
  console.log(`║  Outstanding:      ₱${String(summary.total_outstanding_balance.toLocaleString()).padStart(12)}                ║`);
  console.log(`║  Collectors:         ${summary.collectors.join(', ').padEnd(30)} ║`);
  console.log(`║  Batches:            ${summary.batches.length} batches (${summary.batches[0]}–${summary.batches[summary.batches.length - 1]})`.padEnd(53) + '║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\n✅ All files written to: ${OUTPUT_DIR}`);
}

// ── run ─────────────────────────────────────────────────────────────────────
try {
  main();
} catch (err) {
  console.error('❌ Fatal error:', err);
  process.exit(1);
}
