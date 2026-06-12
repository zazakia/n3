---
name: deploy-infinity
description: Master skill for QA testing, regression prevention, and production deployment of the InfinityFinance app to Cloudflare Pages (https://infinity-finance.pages.dev).
---

# InfinityFinance QA & Deployment Pipeline

This skill dictates the rigorous procedure that must be followed before and during deployment of the InfinityFinance app to ensure it remains a high-quality, reliable application without regressions or broken workflows.

## 1. Zero-Regression Policy
Before deploying any code to production (`https://infinity-finance.pages.dev`), you must guarantee that no existing functionality, features, or workflows are broken.
- **Rule 1:** Never bypass tests. If a test fails, you must investigate the root cause instead of blindly deleting, skipping, or commenting out the test.
- **Rule 2:** Ensure type safety. All components and services must pass strict TypeScript checks.
- **Rule 3:** Linter compliance. Code should adhere to the project's ESLint configuration.

## 2. Full Suite Verification Phase
Run the following checks sequentially. Stop immediately and fix any issues if a step fails:

### Step 2.1: Database Schema Verification
Ensure there are no pending schema changes that the new codebase depends on.
```bash
npx supabase db push
```

### Step 2.2: Type Checking & Linting
Run static analysis to catch syntax and typing errors.
```bash
npm run lint
```

### Step 2.3: Unit Tests
Verify that isolated business logic, database models, and services function correctly.
```bash
npm run test
```

### Step 2.4: Full E2E Test Suite (Playwright)
Verify the complete user journey, UI/UX, and workflows in a realistic browser environment.
- Run `npm run test:e2e`
- Ensure tests execute stably. Do not proceed if there are any failures in the end-to-end regression suite.
- Wait for the entire suite to pass.

## 3. Pre-Deployment Integrity Check
Before deploying to Cloudflare, verify the web production build and export succeeds locally:
```bash
npm run export:web:production
```
A successful export confirms that the web bundle is sound and ready for deployment without bundling errors.

## 4. Deployment to Cloudflare Pages
Once all verifications pass 100%, proceed to deploy the application to Cloudflare.

### Deployment Command
Use the defined NPM script to deploy to the Cloudflare environment:
```bash
npm run deploy:cloudflare:infinity
```
- This command builds the production web bundle and uploads it to Cloudflare Pages.
- Ensure the deployment points to the correct domain: `https://infinity-finance.pages.dev`.

## 5. Post-Deployment Verification
After deployment finishes:
1. Verify the production URL (`https://infinity-finance.pages.dev`) is accessible.
2. Check that critical flows (e.g., Login, Offline Sync, Dashboard load, Collection sheets) function correctly in the live environment without errors.
3. Validate that the production Supabase database is correctly linked and functioning. NEVER run destructive operations against the production database.

**Failure is not an option.** By following this checklist, you ensure the InfinityFinance application maintains enterprise-grade reliability and quality without breaking features.
