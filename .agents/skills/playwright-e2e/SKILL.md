---
name: playwright-e2e
description: Playwright End-to-End testing conventions and workflows for InfinityFinance
---

# Playwright E2E Testing Skill — InfinityFinance

## Overview
This skill covers the Playwright End-to-End testing setup for the InfinityFinance React Native Expo web target.

## Setup & Configuration
- **Runner**: Playwright (`playwright.config.ts`)
- **Location**: `tests/` directory.
- **Web Server**: `playwright.config.ts` automatically boots the web server using `node scripts/start-playwright-web.mjs`.
- **Environment**: E2E tests use `.env.test` for environment variables. **Production protection** is enabled: tests will throw an error and refuse to run if they detect the production Supabase URL in `EXPO_PUBLIC_SUPABASE_URL`.
- **Global Setup**: `tests/global-setup.ts` initializes state.

## Test Inventory
Tests are organized by role and feature in `tests/`:
- `admin.spec.ts` - Admin workflow tests
- `collector.spec.ts` - Collector workflow tests
- `encoder.spec.ts` - Encoder workflow tests
- `auth.spec.ts` - Authentication flows
- `rbac_security.spec.ts` - Role-Based Access Control security tests
- `data_management.spec.ts` - Data management, migration, and CRUD tests
- `sync-verify.spec.ts` / `global-sync-button.spec.ts` - Sync verification tests
- `new_features.spec.ts` - Testing new app features

## Key Patterns

### Authentication
Authentication in tests is handled using the `playwright-auth.ts` helper located in `tests/playwright-auth.ts`. It provides reusable authentication wrappers to simplify signing in for various roles (admin, collector, encoder).

```typescript
import { test, expect } from '@playwright/test';
// Example pattern:
// import { loginAsAdmin } from './playwright-auth';

test('admin can see dashboard', async ({ page }) => {
  // await loginAsAdmin(page);
  // await expect(page.getByText('Admin Dashboard')).toBeVisible();
});
```

## Running Tests
Run tests using the Playwright CLI from the project root:

```bash
# Run all E2E tests
npx playwright test

# Run a specific test file
npx playwright test tests/admin.spec.ts

# Run tests with UI mode (helpful for debugging and tracing)
npx playwright test --ui

# View HTML report after a test run (automatically generated on failure)
npx playwright show-report
```

## Troubleshooting
- **Port Conflicts**: If tests fail to start the web server, ensure `scripts/start-playwright-web.mjs` (which defaults to port 19009) is not already running or hung in the background.
- **Production Guard**: Check `.env.test` and `.env.local` to verify they are properly configured to point to your local or test Supabase instance and NOT production. The tests will abort if `EXPO_PUBLIC_SUPABASE_URL` matches the production URL.
- **Timeouts**: Due to local dev server boot times, tests might timeout. The global timeout is set to 120s and expect timeout to 30s. If it frequently times out, consider running the web server manually and commenting out the `webServer` block in `playwright.config.ts`.
