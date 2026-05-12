---
description: How to build and deploy InfinityFinance to Android and Web
---

# Deploy Workflow

## Pre-Deploy Checks

### 1. Run Full Test Suite
// turbo
Run: `npx jest --coverage`

Ensure all tests pass and coverage meets thresholds.

### 2. Verify Production Env
Check `.env.production` has correct production Supabase credentials:
```env
EXPO_PUBLIC_SUPABASE_URL=https://dbocdelbzirvzdsmmnmt.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<production-key>
```

### 3. Bump Version
Update `version` in `package.json` (e.g., `"1.0.22"` → `"1.0.23"`).

## Android Build

### Development Build (Local APK)
4. Run: `eas build --platform android --profile preview`

### Production Build
5. Run: `eas build --platform android --profile production`

EAS config is in `eas.json`.

### Install APK
6. Download the APK from the EAS build URL and install on device.
   Current APK: `infinityv21.apk` (117MB)

## Web Build

### Export for Web
// turbo
7. Run: `npx expo export --platform web`

Output goes to `dist/` directory.

### Deploy to Netlify
8. Netlify config is in `netlify.toml`. Deploy:
   - Push to GitHub (auto-deploy if configured)
   - Or manual: `netlify deploy --prod --dir=dist`

## Post-Deploy Verification

9. Verify:
   - Login works for all roles
   - Sync completes successfully
   - Dashboard loads data
   - Collection sheets render
