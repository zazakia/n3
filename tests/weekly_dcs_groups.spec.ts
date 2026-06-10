import { test, expect } from '@playwright/test';
import { loginAsAdmin, safeNavigate } from './playwright-auth';

test('verify Angelica Polo and Mechelle Montillano groups in Weekly DCS', async ({ page }) => {
  // 1. Log in as admin
  await loginAsAdmin(page);

  // 2. Navigate to Weekly DCS Area Sheet
  await safeNavigate(page, '/reports/weekly-dcs');
  await expect(page.getByText('Weekly DCS Area Sheet')).toBeVisible();

  // 3. Select Angelica Polo
  await page.getByText('Angelica Polo', { exact: false }).first().click();
  
  // Wait a moment for groups to populate
  await page.waitForTimeout(1000);

  // Verify Angelica's distinct groups appear in the group filters. 
  // We'll just check a few of them from our updated list.
  const angelicaGroups = ['Balugo', 'Cambalading', 'MAGBANGON', 'Tinag-an', 'Salvacion'];
  for (const group of angelicaGroups) {
    await expect(page.getByText(group, { exact: true })).toBeVisible();
  }

  // Check the Clients count is around 310 (some might be inactive or fully paid, but it should be way higher than 46)
  // We can just verify it doesn't say "46" anymore, or we can check the clients stat block
  const clientsStat = page.locator('text=/^CLIENTS$/i').locator('xpath=following-sibling::*').first();
  const clientsText = await clientsStat.textContent();
  console.log(`Angelica Polo Clients showing in UI: ${clientsText}`);
  expect(Number(clientsText)).toBeGreaterThan(46);

  // 4. Select Mechelle montillano
  await page.getByText('All', { exact: false }).first().click(); // reset collector filter first
  await page.getByText('Mechelle montillano', { exact: false }).first().click();
  
  await page.waitForTimeout(1000);

  // Verify Mechelle's distinct groups appear in the group filters.
  const mechelleGroups = ['Bunga', 'Gabas Baybay City', 'San Agustin', 'Zone 18 baybay', 'Zone 20 baybay'];
  for (const group of mechelleGroups) {
    await expect(page.getByText(group, { exact: true })).toBeVisible();
  }

  const mClientsStat = page.locator('text=/^CLIENTS$/i').locator('xpath=following-sibling::*').first();
  const mClientsText = await mClientsStat.textContent();
  console.log(`Mechelle Montillano Clients showing in UI: ${mClientsText}`);
  expect(Number(mClientsText)).toBeGreaterThan(135);
});
