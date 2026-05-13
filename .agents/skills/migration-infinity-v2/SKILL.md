---
name: migration-infinity-v2
description: Specialized tools and procedures for migrating DCM legacy data into InfinityFinance v2
---

# Migration Infinity v2 Skill

This skill provides a standardized pipeline for migrating legacy DCM (Data Collection Management) data into the InfinityFinance v2 database schema. It handles collector normalization, borrower deduplication, loan lifecycle state mapping, and high-volume payment ledger imports.

## Pipeline Overview

1. **Pre-flight**: Fix local schema (RLS, permissions, missing columns).
2. **Clear**: Purge existing loan data for a clean import.
3. **Analyze**: Verify source CSVs in `DCM_Migration_Exports/`.
4. **Import**: Execute deterministic migration with collector mapping.

## Script Catalog

All scripts are located in `.agents/skills/migration-infinity-v2/scripts/`.

| Script | Purpose | Usage |
|--------|---------|-------|
| `fix-schema.mjs` | Fixes RLS, grants permissions, and adds missing `is_active` column | `node .agents/skills/migration-infinity-v2/scripts/fix-schema.mjs` |
| `clear-db.mjs` | Clears all borrowers, loans, and payments | `node .agents/skills/migration-infinity-v2/scripts/clear-db.mjs` |
| `import-dcm.mjs` | Full deterministic migration from CSV exports | `node .agents/skills/migration-infinity-v2/scripts/import-dcm.mjs` |

## Migration Details

### Collector Normalization
The migration maps legacy collector names to normalized system collectors:
- *Cesencio Junco* → *Cresencio Junco*
*   *Jayson Cayanong* → *Jason Cayanong*
*   *Gera Gerald* → *Gerald Gera*

### Loan State Mapping
To comply with the `unique_active_loan_per_borrower` constraint:
- Only the **most recently released** loan (sorted by `date_release` descending, falling back to `cycle` number) with a positive balance is marked as `active`.
- All other loans (fully paid or historical cycles) are marked as `completed`.

### Deterministic IDs
The script uses deterministic UUIDs (MD5 hash of legacy stage IDs). This allows for idempotent re-runs without creating duplicate records.

## Usage Workflow

```bash
# 1. Prepare Schema
node .agents/skills/migration-infinity-v2/scripts/fix-schema.mjs

# 2. Clear Existing Data (CAUTION)
node .agents/skills/migration-infinity-v2/scripts/clear-db.mjs

# 3. Run Migration
node .agents/skills/migration-infinity-v2/scripts/import-dcm.mjs
```
