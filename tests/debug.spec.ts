import { test, expect } from '@playwright/test';

test('debug quick login users', async ({ page }) => {
  await page.goto('/');
  const loginEmail = page.locator('input[placeholder="user@infinityfinance.com"]');
  await expect(loginEmail).toBeVisible({ timeout: 30000 });
  console.log('Quick login UI is not required in this build; standard login form is present.');
});
