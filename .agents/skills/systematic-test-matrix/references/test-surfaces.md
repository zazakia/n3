# InfinityFinance verification surfaces

## Baseline checks

- `npx tsc --noEmit`
- `npx expo-doctor`

## Jest module buckets

Discovered from `app/**/__tests__` and `src/**/__tests__` directories that contain real `*.test.*` files.

Current likely buckets include:

- `app/__tests__`
- `app/(admin)/borrowers/__tests__`
- `app/(admin)/collectors/__tests__`
- `app/(admin)/loans/__tests__`
- `app/(admin)/reports/__tests__`
- `app/(admin)/settings/__tests__`
- `src/components/__tests__`
- `src/database/models/__tests__`
- `src/hooks/__tests__`
- `src/services/__tests__`
- `src/store/__tests__`
- `src/stores/__tests__`
- `src/utils/__tests__`

## Integrated surfaces

- `npm test -- --runInBand --forceExit`
- `npx playwright test --workers=1 --reporter=list`
- `npm run export:web`

## Export smoke

After `dist/` is generated:

1. Serve `dist/` on a local port.
2. Open the root URL in Chromium.
3. Fail on page errors or console errors.
4. Capture final URL and page title.

## Evidence expectations

Do not claim success from stale logs. Use the newest timestamped directory under:

```txt
tmp/systematic-test-matrix/
```

For failures, report:

- step name
- exit code
- log file path
- first actionable error or failing test
