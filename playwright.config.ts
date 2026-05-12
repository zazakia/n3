import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
require('dotenv').config({ path: '.env.test' });
require('dotenv').config({ path: '.env.local', override: true });

const PRODUCTION_URL = 'https://dbocdelbzirvzdsmmnmt.supabase.co';
const PLAYWRIGHT_WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT || '19009';
const PLAYWRIGHT_WEB_URL = `http://localhost:${PLAYWRIGHT_WEB_PORT}`;
if (process.env.EXPO_PUBLIC_SUPABASE_URL === PRODUCTION_URL) {
  throw new Error(
    `\n❌ SAFETY BREACH: Playwright tests are attempting to use the PRODUCTION database!\n` +
    `Current URL: ${process.env.EXPO_PUBLIC_SUPABASE_URL}\n` +
    `Please ensure you are using .env.test for e2e tests.\n`
  );
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: 1,
  /* Opt out of parallel tests on CI. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'list',
  timeout: 120000,
  expect: {
    timeout: 30000,
  },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: PLAYWRIGHT_WEB_URL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'node scripts/start-playwright-web.mjs',
    url: PLAYWRIGHT_WEB_URL,
    reuseExistingServer: true,
    timeout: 240000,
    env: {
      PLAYWRIGHT_WEB_PORT,
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://localhost:55321',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
      NODE_ENV: 'test',
    },
  },
});
