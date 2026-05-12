# Database Safety Measures

To prevent accidental data loss or corruption in the production environment, strict safeguards have been implemented for all test suites.

## Automated Guards

Both unit tests (Jest) and end-to-end tests (Playwright) include mandatory environment checks.

- **Jest**: Configured in `src/jest-setup.ts`.
- **Playwright**: Configured in `playwright.config.ts`.

If the script detects `EXPO_PUBLIC_SUPABASE_URL` pointing to the production project (`https://dbocdelbzirvzdsmmnmt.supabase.co`), it will immediately throw an error and terminate the process.

## Environment Variables

| File | Purpose | Supabase URL |
|------|---------|--------------|
| `.env.production` | Production deployment | `https://dbocdelbzirvzdsmmnmt.supabase.co` |
| `.env.test` | Testing & CI | `https://tkavsythcprbmtunggup.supabase.co` |
| `.env.local` | Local development | Varies (Local or dev branch) |

## AI Assistant Prompt (Instruction for Future Tasks)

When using AI assistants, include the following rule in the system instructions or conversation context:

```markdown
### SYSTEM RULE: PROTECT PRODUCTION DATABASE
ALWAYS ensure that any code changes related to testing, database migrations, or environment configuration strictly AVOID using the production Supabase URL: `https://dbocdelbzirvzdsmmnmt.supabase.co`.

When writing or running tests:
1. Verify that `NODE_ENV` is set to `test`.
2. Ensure `.env.test` or a local development database is being used.
3. If an operation requires a database, use the test project: `https://tkavsythcprbmtunggup.supabase.co`.
4. NEVER perform destructive operations or seeding on the production URL unless explicitly and specifically requested for a one-time production maintenance task with user confirmation.
```
