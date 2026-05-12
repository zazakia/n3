---
name: systematic-test-matrix
description: Run the full InfinityFinance verification matrix with evidence. Use when Codex needs to systematically execute all repo test types and module buckets, including TypeScript, Expo doctor, Jest by module, full Jest, Playwright, web export, and optional production smoke checks.
---

# Systematic Test Matrix

Run the repo's verification surfaces in a fixed order and keep evidence in `tmp/systematic-test-matrix/`.

## Quick start

1. Confirm the repo root is `ReactNative-expo-LoanWaterMelon`.
2. Run the matrix script:

```powershell
node .agents/skills/systematic-test-matrix/scripts/run_matrix.mjs
```

3. Read the summary JSON and failing step logs from the newest `tmp/systematic-test-matrix/<timestamp>/` directory before claiming success.

## Workflow

### 1. Run safety-first baseline checks

Always start with:

- `npx tsc --noEmit`
- `npx expo-doctor`

If either fails, stop and fix that before moving deeper into test surfaces.

### 2. Run Jest systematically by module bucket

Use the script's discovered Jest buckets so failures stay localized. The script scans `app/` and `src/` for `__tests__` directories with real `*.test.*` files and runs each bucket sequentially.

This repo commonly includes buckets such as:

- `src/services/__tests__`
- `src/components/__tests__`
- `src/store/__tests__`
- `src/stores/__tests__`
- `src/utils/__tests__`
- `src/hooks/__tests__`
- `src/database/models/__tests__`
- `app/__tests__`
- `app/(admin)/**/__tests__`

### 3. Re-run the full integrated suites

After module buckets pass, run the broad surfaces:

- full Jest
- full Playwright
- `npm run export:web`

Use these runs to verify cross-module interactions that bucketed runs can miss.

### 4. Run export smoke when web export matters

By default the script serves `dist/` locally and opens the exported app in Chromium. It fails if:

- the export server does not start
- the page throws an uncaught error
- the browser console emits an error

The smoke check is intentionally lightweight and should confirm the exported app loads and redirects normally.

## Commands

### Default full matrix

```powershell
node .agents/skills/systematic-test-matrix/scripts/run_matrix.mjs
```

### Skip long surfaces while debugging

```powershell
node .agents/skills/systematic-test-matrix/scripts/run_matrix.mjs --skip-playwright --skip-smoke
```

### Resume only the remaining surface

```powershell
node .agents/skills/systematic-test-matrix/scripts/run_matrix.mjs --only=playwright_full
```

### Keep running after failures to collect the full picture

```powershell
node .agents/skills/systematic-test-matrix/scripts/run_matrix.mjs --no-bail
```

## Outputs

The script writes:

- `summary.json` — machine-readable status for every step
- `*.log` — full logs per command
- `smoke.json` — export smoke details when smoke runs

Read `references/test-surfaces.md` when you need the exact included surfaces or want to extend the matrix.
