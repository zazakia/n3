import type { AppUpdateEntry } from './appUpdates';

export const GENERATED_APP_UPDATES: AppUpdateEntry[] = [
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
