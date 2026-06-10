# InfinityFinance Application Audit Report

## Quick Wins

### 1. Prevent Duplicate Old Loan Closure Payments
- **Files**: `src/services/LoanService.ts`
- **Justification**: In `saveLoan`, editing an active reloan triggers the "Old Loan Closure" block unconditionally if `status === 'active' && isReloan && previousLoanId`. This erroneously creates duplicate deduction payments on the previous loan on every edit. A check should be added to ensure closure only triggers upon initial activation (`!isEditing || existingLoan?.status !== 'active'`).

### 2. Fix Auto-deposit Savings Under-crediting
- **Files**: `src/services/PaymentService.ts`
- **Justification**: `reconcileAutoDeposits` incorrectly divides `loan.depositAmount` by the number of schedules. However, `loan.depositAmount` is already a periodic (per-payment) deposit. This results in severely under-crediting the borrower's savings account during each payment. The division must be removed.

### 3. Increase Network Timeouts for Sync
- **Files**: `src/services/SyncService.ts`
- **Justification**: `TABLE_PAGE_TIMEOUT_MS` and `UPSERT_TIMEOUT_MS` are hardcoded to `10000` (10 seconds). In offline-first 3G mobile contexts with large payloads, this is too aggressive. Increasing this to `30000` (30s) will prevent unnecessary sync abortions.

### 4. Debounce Search Input & Memoize Filter Arrays
- **Files**: `src/components/SearchBar.tsx`, `app/(admin)/loans/index.tsx`, `app/(admin)/borrowers/index.tsx`
- **Justification**: The `SearchBar` updates state on every keystroke without debouncing, triggering an O(N) unmemoized `.filter()` over the entire dataset in memory and freezing the UI. Debouncing and wrapping filtered arrays in `useMemo` instantly resolves search lag.

### 5. Extract Inline `renderItem` in Lists
- **Files**: `app/(admin)/loans/index.tsx`, `app/(admin)/borrowers/index.tsx`, `app/(admin)/payments/index.tsx`
- **Justification**: Defining `renderItem` inside the component body causes `FlatList` to re-render all visible items on every state change because the function identity changes. Wrapping it in `useCallback` and using `React.memo` for items prevents these excessive re-renders.

### 6. Batch Supabase Upserts
- **Files**: `src/services/SyncService.ts`
- **Justification**: `pushChangesToSupabase` sends all `toUpsert` records in a single `.upsert()` call. Chunking into batches of 500 avoids hitting PostgREST payload limits or database statement timeouts during large syncs.

---

## Architectural Overhauls

### 1. Fix Conflict Resolution Deadlock in SyncService
- **Files**: `src/services/SyncService.ts`
- **Justification**: The current sync implementation blocks local pending changes from being pushed if the server has newer updates. However, WatermelonDB's `synchronize()` defaults to ignoring remote updates if the local record has unsynced changes. This causes a permanent deadlock where a conflicting record is never pushed and never updated. This must be refactored to use a robust `conflictResolver` implementing a Last-Write-Wins (LWW) strategy.

### 2. Adopt Reactive Data Fetching (`withObservables`)
- **Files**: `src/hooks/useBorrowers.ts`, `app/(admin)/**/*.tsx`
- **Justification**: Screens currently use `useFocusEffect` to imperatively fetch entire tables into React state (`.query().fetch()`). This defeats WatermelonDB's reactive architecture and overloads the JS bridge. Transitioning to `withObservables` allows WatermelonDB to push only changed rows automatically, drastically improving rendering performance and memory efficiency.

### 3. Push Computations to the Database (Denormalization / Aggregation)
- **Files**: `app/(admin)/loans/index.tsx`, `src/services/MfiKpiService.ts`
- **Justification**: Currently, `MfiKpiService` and screens fetch all payments and schedules into JS memory to compute properties like balance and "Portfolio At Risk" via `.reduce()`. This O(N) mapping will crash the app on large datasets. The architecture must shift to storing a computed `balance` field directly on the `Loan` model or executing raw SQLite aggregate queries instead of mapping in JavaScript.

### 4. Transaction Atomicity and Batching in Payment Mutations
- **Files**: `src/services/PaymentService.ts`
- **Justification**: Mutations currently execute immediate sequential `.update()` calls inside `db.write()` blocks, followed by a separate `db.batch()`. Issuing individual promises triggers multiple discrete React Native bridge crossings. The service should be refactored to use `.prepareUpdate()` on all models, executing them atomically within a single `db.batch()` array.
