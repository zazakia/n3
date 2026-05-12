---
name: testing
description: Jest + WatermelonDB testing patterns for InfinityFinance services
---

# Testing Skill — InfinityFinance

## Stack

| Layer | Tech |
|-------|------|
| Runner | `jest-expo` preset (`jest.config.js`) |
| Setup | `src/jest-setup.ts` — mocks for Reanimated, Gesture Handler, AsyncStorage, SafeArea, Vector Icons, Worklets |
| Test DB | LokiJS in-memory adapter via `createTestDatabase()` from `src/__tests__/test-utils.ts` |
| Timeout | 15 seconds default (`testTimeout: 15000`) |
| Coverage | `collectCoverageFrom: src/**/*.{js,jsx,ts,tsx}` excluding `.d.ts` and `mocks/` |

## Safety Guard

`jest-setup.ts` **blocks production** at line 30-36. If `EXPO_PUBLIC_SUPABASE_URL` matches the production URL, tests throw immediately. This prevents accidental production writes.

Tests must use `.env.test` values or the fallback dummy keys set in `jest-setup.ts`:
```
EXPO_PUBLIC_SUPABASE_URL=https://tkavsythcprbmtunggup.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_kIx0oddu5YwQX4Ox7wB7nQ_4umhYkcm
```

## Service Dependency Injection Pattern

All services accept an optional `Database` parameter in the constructor. Tests inject the in-memory test database:

```typescript
import { createTestDatabase } from '../../__tests__/test-utils';

let database: Database;
let service: ActionLogService;

beforeEach(async () => {
    database = createTestDatabase();
    service = new ActionLogService(database);
    jest.clearAllMocks();
});
```

Services that use Supabase should have `../database/supabase` auto-mocked via `src/database/__mocks__/supabase.ts`.

## Mock Catalog

### Auto-Mocks (via `__mocks__/` directories)
- `src/database/__mocks__/index.ts` — Mocks global `database` export
- `src/database/__mocks__/supabase.ts` — Mocks `supabase` client with chainable `.from().select().insert().upsert()`

### Manual Mocks (from `jest-setup.ts`)
- `react-native-gesture-handler` — Jest setup module
- `expo-blur` — `BlurView` → plain `View`
- `react-native-safe-area-context` — Insets return `{ top: 0, right: 0, bottom: 0, left: 0 }`
- `@expo/vector-icons` — All icon families (Ionicons, MaterialIcons, etc.) → plain `View`
- `@react-native-async-storage/async-storage` — Official Jest mock
- `react-native-reanimated` — Full manual mock with animation builders (FadeIn, Layout, etc.)
- `react-native-worklets` / `react-native-worklets-core` — Stub `createRunOnJS`/`createRunOnUI`

### Per-Test Mocks (common patterns)
```typescript
// Mock AuthService
jest.mock('../AuthService', () => ({
    AuthService: {
        getCurrentUserId: jest.fn().mockResolvedValue('user-123'),
    }
}));

// Mock MfiKpiService (for MonthlyClosingService)
jest.mock('../MfiKpiService', () => ({
    MfiKpiService: {
        getBalanceSheet: jest.fn().mockResolvedValue({ assets: { totalAssets: 100000, loanPortfolio: 80000 }, equity: { totalEquity: 50000 }, liabilities: { totalLiabilities: 50000 } }),
        getIncomeStatement: jest.fn().mockResolvedValue({ operatingRevenue: 20000, financialCosts: 5000, loanLossProvisions: 2000 }),
        getAdvancedKpis: jest.fn().mockResolvedValue({}),
    }
}));

// Mock Toast (for ErrorService)
jest.mock('../../components/AppToast', () => ({
    show: jest.fn(),
}));
```

## Running Tests

### Single service with coverage
```bash
npx jest src/services/__tests__/CashService.test.ts --coverage --collectCoverageFrom="src/services/CashService.ts"
```

### All service tests
```bash
npx jest src/services/__tests__/ --coverage
```

### All tests
```bash
npx jest --coverage
```

### Component tests are in
- `src/components/__tests__/`
- `app/__tests__/`
- `src/store/__tests__/`
- `src/database/models/__tests__/`
- `src/utils/__tests__/`

## Test File Inventory

| Service File | Test File | Status |
|-------------|-----------|--------|
| `ActionLogService.ts` | ✅ `ActionLogService.test.ts` | Has tests |
| `AuditService.ts` | ✅ `AuditService.test.ts` | Has tests |
| `AuthService.ts` | ✅ `AuthService.test.ts` | Has tests |
| `BackupService.ts` | ✅ `BackupService.test.ts` | Has tests |
| `BaseModelService.ts` | ✅ `BaseModelService.test.ts` | Has tests |
| `CashService.ts` | ✅ `CashService.test.ts` | Has tests |
| `EncryptionService.ts` | ✅ `EncryptionService.test.ts` | Has tests |
| `ErrorService.ts` | ✅ `ErrorService.test.ts` | Has tests |
| `KpiCalculator.ts` | ✅ `KpiCalculator.test.ts` | Has tests |
| `LoanCalculatorService.ts` | ✅ `LoanCalculatorService.test.ts` | Has tests |
| `MfiKpiService.ts` | ✅ `MfiKpiService.test.ts` | Has tests |
| `PdfGenerator.ts` | ✅ `PdfGenerator.test.ts` | Has tests |
| `ReminderService.ts` | ✅ `ReminderService.test.ts` | Has tests |
| `SyncService.ts` | ✅ `SyncService.test.ts` + `SyncService.integration.test.ts` | Has tests |
| `MonthlyClosingService.ts` | ❌ **Missing** | Needs creation |

## Creating Tests for MonthlyClosingService

`MonthlyClosingService` is a static-method-only class with 3 methods. It depends on `database` (global import) and `MfiKpiService`. Here's the blueprint:

### Dependencies to Mock
1. `../database` — auto-mock won't work well here since it uses `database.write()` and `database.collections.get()` — use `createTestDatabase()`
2. `../MfiKpiService` — mock `getBalanceSheet()`, `getIncomeStatement()`, `getAdvancedKpis()`
3. `date-fns` — real module, no mock needed

### Test Structure
```typescript
// src/services/__tests__/MonthlyClosingService.test.ts

import { MonthlyClosingService } from '../MonthlyClosingService';
import { createTestDatabase } from '../../__tests__/test-utils';
import { Database } from '@nozbe/watermelondb';
import { MfiKpiService } from '../MfiKpiService';

// Because MonthlyClosingService uses static methods with the global `database`,
// we need to mock the database module to inject our test DB
jest.mock('../../database', () => {
    const { createTestDatabase } = jest.requireActual('../../__tests__/test-utils');
    const db = createTestDatabase();
    return { database: db, __testDb: db };
});

jest.mock('../MfiKpiService', () => ({
    MfiKpiService: {
        getBalanceSheet: jest.fn().mockResolvedValue({
            assets: { totalAssets: 100000, loanPortfolio: 80000 },
            equity: { totalEquity: 50000 },
            liabilities: { totalLiabilities: 50000 },
        }),
        getIncomeStatement: jest.fn().mockResolvedValue({
            operatingRevenue: 20000,
            financialCosts: 5000,
            loanLossProvisions: 2000,
        }),
        getAdvancedKpis: jest.fn().mockResolvedValue({}),
    },
}));

describe('MonthlyClosingService', () => {
    describe('closeMonth', () => {
        it('creates a financial snapshot for the given month', async () => { ... });
        it('returns null on error', async () => { ... });
        it('sets correct snapshot fields from balance sheet and income statement', async () => { ... });
        it('calculates risk-weighted assets as loanPortfolio * 1.2', async () => { ... });
    });

    describe('isMonthClosed', () => {
        it('returns false for a month with no snapshot', async () => { ... });
        it('returns true after closeMonth is called', async () => { ... });
    });

    describe('getClosingHistory', () => {
        it('returns empty array when no snapshots exist', async () => { ... });
        it('returns all snapshots after multiple months are closed', async () => { ... });
    });
});
```

### Key Test Cases
- **closeMonth**: Verify snapshot fields match the mocked KPI values, `snapshotDate` is end-of-month, `riskWeightedAssets = loanPortfolio * 1.2`, `subsidyAdjustment` and `inflationAdjustment` are 0
- **isMonthClosed**: False before closing, true after `closeMonth()`
- **getClosingHistory**: Returns all `FinancialSnapshot` records
- **Error handling**: When `MfiKpiService` throws, `closeMonth` returns `null`

## Babel Gotcha

The `babel.config.js` disables `nativewind/babel` preset in test mode (`isTest`). Decorators are handled via `@babel/plugin-proposal-decorators` (legacy mode). The `env.test.plugins` block is empty — all test-specific config is in `jest-setup.ts`.

## Known Issues
- Long-running tests (>53min as seen on `ActionLogService`) may indicate a hung LokiJS adapter. Kill and re-run.
- `testPathIgnorePatterns` excludes `<rootDir>/tests/` (Playwright E2E) and `test-utils.ts` from Jest runs.
