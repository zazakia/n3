import { test, expect } from '@playwright/test';
import { loginAsAdmin, safeNavigate } from './playwright-auth';

test.describe('Upfront Deduction E2E Verification', () => {
    test.beforeEach(async ({ page }) => {
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
    });

    test('should verify Rosanna T. Germano passbook has correct upfront deduction', async ({ page }) => {
        console.log('Navigating to Borrowers screen via sidebar...');
        
        // 2. Click Borrowers link in the sidebar
        const borrowersLink = page.getByText('Borrowers').first();
        await expect(borrowersLink).toBeVisible({ timeout: 15000 });
        await borrowersLink.click();

        // 3. Wait for the search bar to be visible and search for Rosanna T. Germano
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

        // 4. Click the active loan tab to select it
        // Active loan in database is LN-2025-MAY30-0632
        const loanTab = page.getByText('LN-2025-MAY30-0632').first();
        await expect(loanTab).toBeVisible({ timeout: 15000 });
        await loanTab.click({ force: true });

        // 5. Confirm the selected loan status is ACTIVE
        await expect(page.getByText('ACTIVE').first()).toBeVisible({ timeout: 15000 });

        // 6. Verify Upfront Deduction (Prev. Bal) label and its corrected value of -PHP 1,622.00
        const label = page.getByText('Upfront Deduction (Prev. Bal)').first();
        await expect(label).toBeVisible({ timeout: 15000 });

        const value = page.getByText('-PHP 1,622.00').first();
        await expect(value).toBeVisible({ timeout: 15000 });
        
        console.log('✅ Success: Upfront Deduction is correctly verified as -PHP 1,622.00 on the local target!');
    });
});
