---
name: dcm-full-reset-migrate
description: >
  Complete pipeline to wipe and re-migrate all DCM loan data from the
  DCM-as-of-May-30.xlsx Excel file into InfinityFinance (local or remote
  Supabase). Handles extraction, clearing, migration, balance reconciliation,
  and cycle/flag correction in a single command.
---

# DCM Full Reset & Migrate Skill

Provides a **one-command, idempotent** pipeline that:

1. **Extracts** raw Excel data into clean JSON files
2. **Clears** all business data from the target database (preserves collectors + users)
3. **Migrates** borrowers, loans, payments, and payment schedules
4. **Reconciles** balances with System Auto-Adjustment payments
5. **Corrects** `cycle`, `is_reloan`, and `deducted_amount` on all loans

## Quick Start

```bash
# Step 1 — Dry run (no DB writes; extracts Excel and previews counts)
node scripts/full-reset-migrate.mjs --target local

# Step 2 — Live run on LOCAL database
node scripts/full-reset-migrate.mjs --target local --confirm

# Step 3 — Live run on REMOTE (production) Supabase
node scripts/full-reset-migrate.mjs --target remote --confirm
```

### Optional Flags

| Flag | Effect |
|------|--------|
| `--target local` | Use local Supabase (127.0.0.1:55322) |
| `--target remote` | Use remote Supabase (requires `REMOTE_DB_HOST` + `REMOTE_DB_PASSWORD` in `.env`) |
| `--confirm` | Execute DB writes (without this flag = dry-run) |
| `--skip-extract` | Skip Excel parsing, reuse cached `scripts/migration-data/*.json` |
| `--skip-clear` | Skip the DELETE step (append-only mode, use with care) |

---

## Source File

| Item | Value |
|------|-------|
| Excel file | `files (1)/DCM-as-of-May-30.xlsx` |
| Sheet | `DATA of Clients` |
| JSON cache | `scripts/migration-data/` |

> [!IMPORTANT]
> The Excel file must exist at the path above before running. If it was moved, update `EXCEL_PATH` at the top of `scripts/full-reset-migrate.mjs`.

---

## Pipeline Steps (Detail)

### Step 1 — Extract Excel → JSON
Script reads the Excel sheet, identifies all 51 batch sections, and outputs:

| File | Content |
|------|---------|
| `scripts/migration-data/borrowers.json` | 223 unique borrowers |
| `scripts/migration-data/loans.json` | 671 loans |
| `scripts/migration-data/payments.json` | ~17,600 daily payment entries |
| `scripts/migration-data/summary.json` | Aggregate counts & totals |

**Business rules applied during extraction:**
- Collector name normalization (e.g. "Cesencio Junco" → "Cresencio Junco")
- Borrower name typo corrections
- Excel date serial → ISO date conversion
- Release date year-typo fix (2016 → 2026)
- Maturity date anomaly corrections:
  - *Month/Day Swaps:* If Month/Day were swapped (DD/MM/YYYY written but parsed as MM/DD/YYYY by Excel, e.g. July 12, 2025 for an October 22, 2025 loan), it swaps them back to restore the correct maturity date (e.g. December 7, 2025).
  - *Year Typos:* If the maturity date year is off by 1 year (e.g. written as 2025 instead of 2026 for a late December 2025 loan), it increments it by 1 year to restore the correct year (e.g. February 17, 2026 instead of 2025).
- Reloan chaining: loans sorted by `release_date`, linked via `previous_loan_ref`
- Rollover payments: when a previous loan has a remaining balance, a `"Rollover settlement to new loan"` payment is inserted to zero it out **before** the new loan is issued

### Step 2 — Clear Database
Deletes all rows from 17 business tables in FK-safe order.  
**Preserved:** `app_collectors`, `user_profiles`, `auth.users`, `auth.identities`

### Step 3 — Migrate Data
Inserts borrowers → loans → payments → payment schedules using **deterministic UUIDs** (MD5 of seed strings). Safe to re-run — all inserts use `ON CONFLICT (id) DO NOTHING`.

> [!IMPORTANT]
> **`deducted_amount` is always set to `0` for ALL migrated loans.**
>
> The old migration bug set `deducted_amount = interest + insurance`, making the UI show incorrect upfront deductions on first loans. The new script correctly sets it to `0` for all historical loans since all prior balances are already settled through the rollover payment mechanism.

### Step 4 — Auto-Adjust Balances
For each loan, compares the DB payment sum against the Excel `total_loan_balance` value.  
If there is a discrepancy > ₱0.02, inserts a single `"System Auto-Adjustment to match legacy Excel balance"` payment to bring the balance in line.

This reconciles 43 loans where the Excel daily payment columns didn't fully add up to the recorded final balance.

### Step 5 — Fix Cycles & Flags
Traverses every borrower's loan renewal chain chronologically and corrects:
- `cycle` — root loan = 1, each renewal increments by 1
- `is_reloan` — `false` for root, `true` for all renewals
- `deducted_amount` — set to `0` (belt-and-suspenders check)

---

## Expected Output (Verified May 30, 2025 Dataset)

```
Borrowers         : 223
Loans             : 671
Payments          : 17,675  (17,632 from Excel + 43 auto-adjustments)
Payment Schedules : 5,780
```

---

## Business Rules Reference

### deducted_amount
- **Migrated loans (historical):** Always `0`. Previous balances are settled through rollover payments.
- **New loans created in-app (post-migration):** The app sets `deducted_amount` to the previous loan's outstanding balance at the time the new loan is created, reducing the Net Loan Released the borrower actually receives.

### Net Loan Released
```
Net Loan Released = principal_amount - deducted_amount
```

### Reloan Settlement Flow
```
Old Loan balance > 0 at renewal time
  → "Rollover settlement to new loan" payment inserted on old loan
  → Old loan status forced to 'paid'
  → New loan: deducted_amount = 0 (rollover already closed the old balance)
  → Borrower receives full principal of new loan in cash
```

---

## Collector Normalization Map

| Excel Value | Normalized To |
|-------------|--------------|
| Cesencio Junco / Cresencio Junco | Cresencio Junco |
| Jayson Cayanong / Jason Cayanong | Jason Cayanong |
| Gerald Gera / Gera Gerald / Gerald  Gera | Gerald Gera |
| Bernie Casera | Bernie Casera |
| Office | Office |

---

## Borrower Name Corrections

| Excel Name | Corrected To |
|------------|-------------|
| Miraluna P. Manoza | Miraluna P. Mañoza |
| Denaro A. Manlucot | Genaro A. Manlucot |
| Lorena Cagabhion Malayan | Lorina Cagabhion Malayan |

---

## Environment Variables

### Local (default, no extra config needed)
```
SUPABASE_DB_HOST     = 127.0.0.1
SUPABASE_DB_PORT     = 55322
SUPABASE_DB_NAME     = postgres
SUPABASE_DB_USER     = postgres
SUPABASE_DB_PASSWORD = postgres
```

### Remote (add to `.env`)
```
REMOTE_DB_HOST       = <host from Supabase Dashboard → Settings → Database>
REMOTE_DB_PORT       = 5432
REMOTE_DB_NAME       = postgres
REMOTE_DB_USER       = postgres
REMOTE_DB_PASSWORD   = <your DB password>
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `❌ Excel not found` | Verify `files (1)/DCM-as-of-May-30.xlsx` exists |
| `❌ Sheet "DATA of Clients" not found` | Open Excel and confirm sheet tab name exactly |
| `connection refused` on local | Run `npx supabase start` to start local Supabase |
| Remote credentials missing | Add `REMOTE_DB_HOST` + `REMOTE_DB_PASSWORD` to `.env` |
| Partial migration (e.g. only borrowers) | Safe to re-run with `--confirm`; all inserts are idempotent |
| Want to skip re-parsing Excel | Add `--skip-extract` flag |

---

## Related Scripts

| Script | Purpose |
|--------|---------|
| `scripts/full-reset-migrate.mjs` | **This skill's main script** — full pipeline |
| `scripts/clear-all-data.mjs` | Standalone clear-only tool (with `--target both` support) |
| `scripts/clean-dcm-may30.mjs` | Standalone Excel extraction only |
| `scripts/migrate-may30.mjs` | Standalone migration only (reads from migration-data JSON) |
| `scripts/auto-adjust-balances.mjs` | Standalone balance reconciliation only |
| `scripts/repair-loan-upfront-deductions.mjs` | Standalone cycle/flag repair only |
