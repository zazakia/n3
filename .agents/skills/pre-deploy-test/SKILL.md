---
name: pre-deploy-test
description: Run comprehensive pre-deployment tests before deploying InfinityFinance.
---

# Pre-Deploy Test

Before initiating any deployment for InfinityFinance (Web or Android), run this test checklist to ensure a safe and accurate deployment:

1. **Database Schema Verification**
   Run: `npx supabase db push` or verify your migrations are fully applied.
   Ensure there are no pending schema changes that the new codebase depends on.

2. **Linting and Static Analysis**
   Run: `npm run lint`
   Ensure no linting errors or TypeScript compilation issues exist.

3. **Unit Tests**
   Run: `npm run test -- --passWithNoTests`
   Make sure all Jest tests pass.

4. **End-to-End Tests**
   Run: `npm run test:e2e`
   Validate critical user flows using Playwright tests.

5. **Dry-Run Web Export**
   Run: `npm run export:web`
   Verify that the web version can be built and exported successfully without bundling errors.

Do not proceed with the deployment workflow until all steps in this test successfully pass.
