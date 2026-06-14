import type { AppUpdateEntry } from './appUpdates';

export const GENERATED_APP_UPDATES: AppUpdateEntry[] = [
    {
        "id": "38b3d01843a5ece5053fca6de681eb99b635af80",
        "version": "38b3d01",
        "versionLabel": "Commit",
        "date": "2026-06-13",
        "title": "Checkpoint workspace state before Bitbucket migration",
        "category": "technical",
        "icon": "code",
        "summary": "The projects under D:\\\\GitHub are being prepared for remote backup to Bitbucket, so this records each repository's current local state before remote creation and push.",
        "changes": [
            "Checkpoint workspace state before Bitbucket migration",
            "The projects under D:\\\\GitHub are being prepared for remote backup to Bitbucket, so this records each repository's current local state before remote creation and push."
        ],
        "codeChanges": [
            "Updated app/(collector)/collection-sheet.tsx",
            "Updated app/__tests__/loading.test.tsx",
            "Updated app/loading.tsx"
        ]
    },
    {
        "id": "416720f5d209ac757ccf683f14d45951bdf6ccd1",
        "version": "416720f",
        "versionLabel": "Commit",
        "date": "2026-06-12",
        "title": "Implement admin reporting dashboard with PDF export and financial KPI services",
        "category": "feature",
        "icon": "new-releases",
        "summary": "Implement admin reporting dashboard with PDF export and financial KPI services",
        "changes": [
            "Implement admin reporting dashboard with PDF export and financial KPI services"
        ],
        "codeChanges": [
            "Updated .agents/skills/deploy-infinity/SKILL.md",
            "Updated app/(admin)/cash-on-hand/index.tsx",
            "Updated app/(admin)/remittances.tsx"
        ]
    },
    {
        "id": "299eca7f65089af03cb127e8d08f5d21f3da468a",
        "version": "299eca7",
        "versionLabel": "Commit",
        "date": "2026-06-11",
        "title": "Bump version to 1.0.27",
        "category": "technical",
        "icon": "code",
        "summary": "Bump version to 1.0.27",
        "changes": [
            "Bump version to 1.0.27"
        ],
        "codeChanges": [
            "Updated app/(admin)/borrowers/index.tsx",
            "Updated app/(admin)/loans/index.tsx",
            "Updated app/(admin)/payments/index.tsx"
        ]
    },
    {
        "id": "79f1deabbd22fd7c0336196739ae7f70fccdf3e7",
        "version": "79f1dea",
        "versionLabel": "Commit",
        "date": "2026-06-11",
        "title": "Final polish for SearchBar debounce, PaymentService allocation, and SyncService batching limit",
        "category": "technical",
        "icon": "code",
        "summary": "Final polish for SearchBar debounce, PaymentService allocation, and SyncService batching limit",
        "changes": [
            "Final polish for SearchBar debounce, PaymentService allocation, and SyncService batching limit"
        ],
        "codeChanges": [
            "Updated app/(admin)/borrowers/index.tsx",
            "Updated app/(admin)/loans/index.tsx",
            "Updated src/components/SearchBar.tsx"
        ]
    },
    {
        "id": "248696beeea2e91e0681b296712619e5b918eab5",
        "version": "248696b",
        "versionLabel": "Commit",
        "date": "2026-06-11",
        "title": "Add safety check to LoanService to prevent editing loans without existingLoan instance and include audit verification files",
        "category": "data",
        "icon": "fact-check",
        "summary": "Add safety check to LoanService to prevent editing loans without existingLoan instance and include audit verification files",
        "changes": [
            "Add safety check to LoanService to prevent editing loans without existingLoan instance and include audit verification files"
        ],
        "codeChanges": [
            "Updated .agents/sentinel/BRIEFING.md",
            "Updated .agents/victory_auditor/handoff.md",
            "Updated .agents/victory_auditor_2/BRIEFING.md"
        ]
    },
    {
        "id": "5c580645d9b1e8464b039ac9338817053ae7afb0",
        "version": "5c58064",
        "versionLabel": "Commit",
        "date": "2026-06-10",
        "title": "Implement weekly collector assignment system, database testing utilities, and project deployment documentation",
        "category": "feature",
        "icon": "new-releases",
        "summary": "Implement weekly collector assignment system, database testing utilities, and project deployment documentation",
        "changes": [
            "Implement weekly collector assignment system, database testing utilities, and project deployment documentation"
        ],
        "codeChanges": [
            "Updated .agents/skills/pre-deploy-test/SKILL.md",
            "Updated .agents/workflows/deploy.md",
            "Updated app/(admin)/reports/weekly-dcs.tsx"
        ]
    },
    {
        "id": "af3dc327edf72f8c1c67a74bcfdc2cd33b1f5fee",
        "version": "af3dc32",
        "versionLabel": "Commit",
        "date": "2026-06-10",
        "title": "Implement theme customization system with dark mode and dynamic color palettes",
        "category": "feature",
        "icon": "new-releases",
        "summary": "Implement theme customization system with dark mode and dynamic color palettes",
        "changes": [
            "Implement theme customization system with dark mode and dynamic color palettes"
        ],
        "codeChanges": [
            "Updated app/(admin)/_layout.tsx",
            "Updated app/(admin)/reports/__tests__/weekly-collection.test.tsx",
            "Updated app/(admin)/reports/__tests__/weekly-dcs.test.tsx"
        ]
    },
    {
        "id": "5083e309b3acae9a6deee4a095b2cf79e5d3d6c6",
        "version": "5083e30",
        "versionLabel": "Commit",
        "date": "2026-06-05",
        "title": "Update CHANGELOG.md for issues #9 to #16",
        "category": "technical",
        "icon": "code",
        "summary": "Update CHANGELOG.md for issues #9 to #16",
        "changes": [
            "Update CHANGELOG.md for issues #9 to #16"
        ],
        "codeChanges": [
            "Updated CHANGELOG.md"
        ]
    },
    {
        "id": "3264331c44ddf91c16490e4dc2192b7cfa1f9db0",
        "version": "3264331",
        "versionLabel": "Commit",
        "date": "2026-06-05",
        "title": "Add production upfront deduction audit and net loan release repair scripts (#16)",
        "category": "data",
        "icon": "fact-check",
        "summary": "Add production upfront deduction audit and net loan release repair scripts (#16)",
        "changes": [
            "Add production upfront deduction audit and net loan release repair scripts (#16)"
        ],
        "codeChanges": [
            "Updated .agents/skills/playwright-e2e/SKILL.md",
            "Updated scripts/audit-production-upfront-deductions.mjs",
            "Updated scripts/deployed-app-excel-verification-report.json"
        ]
    },
    {
        "id": "7b68f73c50f9bf08a15a323dbf540f0aa9f2e87d",
        "version": "7b68f73",
        "versionLabel": "Commit",
        "date": "2026-06-05",
        "title": "Client-side forecasting algorithms and secure SQL sandboxing (#15)",
        "category": "feature",
        "icon": "new-releases",
        "summary": "Client-side forecasting algorithms and secure SQL sandboxing (#15)",
        "changes": [
            "Client-side forecasting algorithms and secure SQL sandboxing (#15)"
        ],
        "codeChanges": [
            "Updated .agents/skills/ai-analytics/SKILL.md",
            "Updated app/(admin)/reports/ai-assistant.tsx",
            "Updated src/utils/__tests__/forecasting.test.ts"
        ]
    },
    {
        "id": "5ee079723126d9193729c48144e68c0a0366d3cc",
        "version": "5ee0797",
        "versionLabel": "Commit",
        "date": "2026-06-05",
        "title": "Implement 2% Service Charge on weekly loans and batch printing (#11)",
        "category": "feature",
        "icon": "new-releases",
        "summary": "Implement 2% Service Charge on weekly loans and batch printing (#11)",
        "changes": [
            "Implement 2% Service Charge on weekly loans and batch printing (#11)"
        ],
        "codeChanges": [
            "Updated app/(admin)/borrowers/[id].tsx",
            "Updated app/(admin)/borrowers/[id]/passbook.tsx",
            "Updated app/(admin)/borrowers/index.tsx"
        ]
    },
    {
        "id": "574242189d49d2ac0b89b70e4a04c244850cb5e7",
        "version": "5742421",
        "versionLabel": "Commit",
        "date": "2026-06-05",
        "title": "Implement Income Statement metrics for GLP and interest pipeline (#14)",
        "category": "feature",
        "icon": "new-releases",
        "summary": "Implement Income Statement metrics for GLP and interest pipeline (#14)",
        "changes": [
            "Implement Income Statement metrics for GLP and interest pipeline (#14)"
        ],
        "codeChanges": [
            "Updated app/(admin)/reports/income-statement.tsx",
            "Updated src/services/MfiKpiService.ts",
            "Updated src/services/__tests__/MfiKpiService.test.ts"
        ]
    },
    {
        "id": "452207412f64c6a41a293ad6716b7193ec39b8c8",
        "version": "4522074",
        "versionLabel": "Commit",
        "date": "2026-06-05",
        "title": "Add AuditService stale upfront deduction verification (#13)",
        "category": "data",
        "icon": "fact-check",
        "summary": "Add AuditService stale upfront deduction verification (#13)",
        "changes": [
            "Add AuditService stale upfront deduction verification (#13)"
        ],
        "codeChanges": [
            "Updated src/services/AuditService.ts",
            "Updated src/services/__tests__/AuditService.test.ts"
        ]
    },
    {
        "id": "ade1cc15bdf23067d7633006c8d0797262700f5b",
        "version": "ade1cc1",
        "versionLabel": "Commit",
        "date": "2026-06-05",
        "title": "Enhancement: add ActionLogService payload sanitization and serialization constraints (#12)",
        "category": "feature",
        "icon": "new-releases",
        "summary": "Enhancement: add ActionLogService payload sanitization and serialization constraints (#12)",
        "changes": [
            "Enhancement: add ActionLogService payload sanitization and serialization constraints (#12)"
        ],
        "codeChanges": [
            "Updated src/services/ActionLogService.ts",
            "Updated src/services/__tests__/ActionLogService.test.ts"
        ]
    },
    {
        "id": "ec9d4c7a6d4fc40bfa89a9e7cbecdfa3b8114638",
        "version": "ec9d4c7",
        "versionLabel": "Commit",
        "date": "2026-06-03",
        "title": "Prevent soft-deleted payments from skewing balances",
        "category": "fix",
        "icon": "build-circle",
        "summary": "Renewal selection and collection reporting were including soft-deleted rows in a few screen-level queries, which could make previous-loan balances too low and collection totals too high.",
        "changes": [
            "Prevent soft-deleted payments from skewing balances",
            "Renewal selection and collection reporting were including soft-deleted rows in a few screen-level queries, which could make previous-loan balances too low and collection totals too high.",
            "Centralized previous-loan balance calculation and filtered active payment/penalty queries consistently across affected flows."
        ],
        "codeChanges": [
            "Updated app/(admin)/loans/new.tsx",
            "Updated app/(admin)/reports/collection.tsx",
            "Updated app/(admin)/reports/daily-collection.tsx"
        ]
    },
    {
        "id": "f76ec2497478ba745ffad95fcf9e6ed2171df928",
        "version": "f76ec24",
        "versionLabel": "Commit",
        "date": "2026-06-03",
        "title": "Complete recent features and bug fixes",
        "category": "feature",
        "icon": "new-releases",
        "summary": "- Added bottom margin to voucher PDF",
        "changes": [
            "Complete recent features and bug fixes",
            "- Added bottom margin to voucher PDF",
            "- Show other Borrower details in passbook"
        ],
        "codeChanges": [
            "Updated .agents/skills/dcm-full-reset-migrate/SKILL.md",
            "Updated AGENTS.md",
            "Updated CHANGELOG.md"
        ]
    },
    {
        "id": "450707818f67e1b960a1b37acf35ed5d7792189a",
        "version": "4507078",
        "versionLabel": "Commit",
        "date": "2026-06-01",
        "title": "Add recurring expenses, theme customization, global notifications, and fix first-of-month test flakes",
        "category": "feature",
        "icon": "new-releases",
        "summary": "Add recurring expenses, theme customization, global notifications, and fix first-of-month test flakes",
        "changes": [
            "Add recurring expenses, theme customization, global notifications, and fix first-of-month test flakes"
        ],
        "codeChanges": [
            "Updated .agents/skills/migration-infinity-v2/SKILL.md",
            "Updated .agents/skills/migration-infinity-v2/scripts/import-dcm.mjs",
            "Updated .github/workflows/unit-tests.yml"
        ]
    },
    {
        "id": "22b86647b1a7d976b92fcaa37cbfa2f24789e93b",
        "version": "22b8664",
        "versionLabel": "Commit",
        "date": "2026-05-30",
        "title": "Backfill changelog for audit issues (#2)",
        "category": "data",
        "icon": "fact-check",
        "summary": "Document the retroactive issue backfill created for the repository bootstrap and SyncService migration tooling so the closed GitHub issues have matching release notes.",
        "changes": [
            "Backfill changelog for audit issues (#2)",
            "Document the retroactive issue backfill created for the repository bootstrap and SyncService migration tooling so the closed GitHub issues have matching release notes."
        ],
        "codeChanges": [
            "Updated CHANGELOG.md"
        ]
    },
    {
        "id": "7b1b9b61ba90e42c95dd94de73c6a660cbe9ce3a",
        "version": "7b1b9b6",
        "versionLabel": "Commit",
        "date": "2026-05-13",
        "title": "Implement SyncService with WatermelonDB integration, migration scripts, and comprehensive test coverage",
        "category": "feature",
        "icon": "new-releases",
        "summary": "Implement SyncService with WatermelonDB integration, migration scripts, and comprehensive test coverage",
        "changes": [
            "Implement SyncService with WatermelonDB integration, migration scripts, and comprehensive test coverage"
        ],
        "codeChanges": [
            "Updated .agents/skills/migration-infinity-v2/SKILL.md",
            "Updated .agents/skills/migration-infinity-v2/scripts/clear-db.mjs",
            "Updated .agents/skills/migration-infinity-v2/scripts/fix-schema.mjs"
        ]
    },
    {
        "id": "ffee12254791781bfab91dff01f0ae64083439c5",
        "version": "ffee122",
        "versionLabel": "Commit",
        "date": "2026-05-12",
        "title": "Initial commit",
        "category": "technical",
        "icon": "code",
        "summary": "Initial commit",
        "changes": [
            "Initial commit"
        ],
        "codeChanges": [
            "Updated .agents/skills/data-ops/SKILL.md",
            "Updated .agents/skills/local-env/SKILL.md",
            "Updated .agents/skills/sync-debug/SKILL.md"
        ]
    }
];
