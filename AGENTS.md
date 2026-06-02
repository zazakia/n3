# Memory

## Project Overview
See @README.md for project overview and @package.json for available npm/pnpm commands for this project.

## Code Style Guidelines
- Use descriptive variable names
- Follow existing patterns in the codebase
- Extract complex conditions into meaningful boolean variables

## Architecture Notes
- **`deducted_amount` on loans**: Always `0` for all migrated historical loans. The app sets this only when creating a NEW reloan in-app if the previous loan has an unpaid balance. Net Loan Released = `principal_amount - deducted_amount`.
- **Reloan settlement**: When a borrower renews, the previous loan's outstanding balance is closed via a rollover payment entry — NOT by deducting from the new loan's principal (for migrated data).
- **Cycle numbering**: Root loans = Cycle 1 / `is_reloan = false`. Each renewal increments cycle. Traversal is chronological by `release_date`.
- **Auto-adjustment payments**: 43 loans have a `"System Auto-Adjustment to match legacy Excel balance"` payment entry — these reconcile cases where daily payment columns in Excel didn't fully total to the recorded final balance. They are intentional and correct.

## Common Workflows
Document frequently used workflows and commands here.

### Full Reset & Re-migrate from Excel (Local)
```bash
# Dry run (safe — no DB writes, just extracts Excel to JSON)
node scripts/full-reset-migrate.mjs --target local

# Live run — clears DB and re-migrates everything fresh
node scripts/full-reset-migrate.mjs --target local --confirm

# Live run — production remote Supabase
node scripts/full-reset-migrate.mjs --target remote --confirm
```
See skill: `dcm-full-reset-migrate` → `.agents/skills/dcm-full-reset-migrate/SKILL.md`

### Individual pipeline steps (if needed separately)
```bash
node scripts/clean-dcm-may30.mjs                             # 1. Excel → JSON only
node scripts/clear-all-data.mjs --target local --confirm     # 2. Clear DB only
node scripts/migrate-may30.mjs --target local                # 3. JSON → DB only
node scripts/auto-adjust-balances.mjs                        # 4. Balance reconciliation only
node scripts/repair-loan-upfront-deductions.mjs --target local --apply  # 5. Fix cycles/flags only
```
