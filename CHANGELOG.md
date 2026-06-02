# Changelog

## Unreleased

### Added

- #3 Displayed upfront deductions (outstanding previous balance) and Net Loan Release calculation in Passbook screen, backfilling data for 446 legacy reloans.
- #4 Added dynamically filterable Search Bar inputs to admin reports screens (Active Loans, Collection Reports, Daily/Weekly, Disbursements).
- #5 Introduced half-page voucher printing support for loans and reloans in the PDF Generator service.
- #6 Implemented live ratio-based breakdown display (Principal, Deposit, Insurance) in the Payment Encoder screen and saved computed deposits.
- #7 Resolved database SyncService sync crash by converting recurring expense timestamps to TIMESTAMPTZ, and added a meeting day column.
- #8 Added support for weekly loan terms and configured detailed validation error alerts in the New Loan screen.
- #1 Bootstrapped the InfinityFinance application, database setup, role-based screens, services, tests, scripts, and documentation.
- #2 Implemented SyncService WatermelonDB integration and DCM migration tooling.
