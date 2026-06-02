import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './playwright-auth';

test('Verify Voucher bottom margin styling on web', async ({ page }) => {
  // Print browser console logs to the test output
  page.on('console', msg => {
      console.log(`[Browser Console] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  // Print browser page errors to the test output
  page.on('pageerror', err => {
      console.error(`[Browser Page Error] ${err.stack || err.message}`);
  });

  await page.setDefaultTimeout(120000);

  // 1. Log in as Admin
  await loginAsAdmin(page);

  // 2. Click Borrowers link in the sidebar
  const borrowersLink = page.getByText('Borrowers').first();
  await expect(borrowersLink).toBeVisible({ timeout: 15000 });
  await borrowersLink.click();

  // 3. Search for Rosanna T. Germano
  const searchInput = page.getByPlaceholder('Search name, phone, or address...');
  await expect(searchInput).toBeVisible({ timeout: 30000 });
  await searchInput.fill('Rosanna T. Germano');

  // 4. Click Rosanna T. Germano in the list
  const borrowerRow = page.getByText('Rosanna T. Germano').first();
  await expect(borrowerRow).toBeVisible({ timeout: 15000 });
  await borrowerRow.click();

  // 5. Click the Passbook button in the borrower's profile
  const passbookBtn = page.getByText('Passbook').first();
  await expect(passbookBtn).toBeVisible({ timeout: 15000 });
  await passbookBtn.click();

  // 6. Confirm borrower identity is displayed on the passbook page
  await expect(page.getByText('Rosanna T. Germano').first()).toBeVisible({ timeout: 30000 });

  // 7. Click the active loan tab to select it (LN-2025-MAY30-0632)
  const loanTab = page.getByText('LN-2025-MAY30-0632').first();
  await expect(loanTab).toBeVisible({ timeout: 15000 });
  await loanTab.click({ force: true });

  // 8. Wait for popup event when clicking VOUCHER button
  const voucherBtn = page.getByText('VOUCHER').first();
  await expect(voucherBtn).toBeVisible({ timeout: 15000 });

  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 30000 }),
    voucherBtn.click(),
  ]);

  await popup.waitForLoadState();
  const html = await popup.content();

  console.log('--- GENERATED VOUCHER HTML ---');
  console.log(html);
  console.log('------------------------------');

  // 9. Assertions on the styling to ensure the new spacing rules are applied
  expect(html).toContain('margin-bottom: 0.6in;');
  expect(html).toContain('font-size: 36px;');
  expect(html).toContain('margin-bottom: 20px;');
  expect(html).toContain('margin-bottom: 25px;');
  expect(html).toContain('margin-top: 45px;');
  expect(html).toContain('margin-top: 25px;');

  console.log('SUCCESS: All bottom margin and space optimization styles verified in the voucher PDF/Print HTML!');
});
