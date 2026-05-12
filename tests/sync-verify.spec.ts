import { test, expect } from '@playwright/test';
import { loginWithCredentials } from './playwright-auth';

test.describe('Sync Center Verification', () => {
  test.setTimeout(120_000); // 2 min timeout

  test('should login and verify sync button works', async ({ page }) => {
    // Step 1: Navigate to the app
    console.log('Step 1: Navigating to app...');
    await page.goto('http://localhost:19009', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000); // wait for React Native Web bundle

    // Step 2: Take initial screenshot
    await page.screenshot({ path: 'test-results/01-initial-page.png', fullPage: true });
    console.log('Step 2: Initial page screenshot taken');

    // Step 3: Login
    console.log('Step 3: Attempting login...');
    await loginWithCredentials(page, 'admin@loanbrick.com');
    await page.waitForTimeout(8000);
    await page.screenshot({ path: 'test-results/02-after-login.png', fullPage: true });
    console.log('Step 3: Login attempted, screenshot taken');

    // Step 4: Navigate to Sync Center
    console.log('Step 4: Navigating to Sync Center...');
    await page.goto('http://localhost:19009/sync-center', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'test-results/03-sync-center.png', fullPage: true });
    console.log('Step 4: Sync Center screenshot taken');

    // Step 5: Look for "Sync Now" button and click it
    console.log('Step 5: Looking for Sync Now button...');
    const syncNowText = page.getByText('Sync Now');
    const syncNowCount = await syncNowText.count();
    console.log(`Found ${syncNowCount} "Sync Now" elements`);

    if (syncNowCount > 0) {
      await syncNowText.first().click();
      console.log('Clicked Sync Now button');
      
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'test-results/04-sync-in-progress.png', fullPage: true });
      console.log('Step 5: Sync in-progress screenshot taken');
      
      console.log('Waiting for sync to complete...');
      let syncDone = false;
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(2000);
        
        const completedText = page.getByText(/Sync completed successfully/i);
        const failedText = page.getByText(/Sync failed/i);
        
        if (await completedText.count() > 0) {
          console.log('? Sync completed successfully!');
          syncDone = true;
          break;
        }
        if (await failedText.count() > 0) {
          const errorDetail = page.getByText(/Sync failed/i);
          const errorText = await errorDetail.first().innerText();
          console.log(`? Sync failed: ${errorText}`);
          syncDone = true;
          break;
        }
      }
      
      if (!syncDone) {
        console.log('? Sync did not complete within timeout');
      }
      
      await page.screenshot({ path: 'test-results/05-sync-result.png', fullPage: true });
      console.log('Step 5: Final sync result screenshot taken');
    } else {
      console.log('Sync Now button not found on page');
      const bodyText = await page.locator('body').innerText();
      console.log('Page content:', bodyText.substring(0, 500));
    }

    // Step 6: Check sync logs
    console.log('Step 6: Checking sync logs...');
    const logEntries = page.getByText(/Pulled|Pushed|Sync started|Sync completed|Sync failed/i);
    const logCount = await logEntries.count();
    console.log(`Found ${logCount} sync log entries`);
    
    for (let i = 0; i < Math.min(logCount, 10); i++) {
      const logText = await logEntries.nth(i).innerText();
      console.log(`  Log ${i + 1}: ${logText}`);
    }

    // Final screenshot
    await page.screenshot({ path: 'test-results/06-final-state.png', fullPage: true });
    console.log('? Verification complete!');
  });
});
