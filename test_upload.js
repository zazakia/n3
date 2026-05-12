const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));

  console.log('Navigating to http://localhost:8081/settings...');
  await page.goto('http://localhost:8081/settings', { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  // login if needed
  if (await page.locator('text=Sign In').isVisible()) {
    console.log('Logging in...');
    await page.locator('text=Sign In').click();
    await page.waitForTimeout(1000);
    await page.goto('http://localhost:8081/settings', { waitUntil: 'load' });
    await page.waitForTimeout(1000);
  }

  // Create a dummy backup file
  console.log('Creating dummy backup file...');
  const fakeBackup = {
      version: 1,
      timestamp: Date.now(),
      data: {
          borrowers: [
              {
                  id: "test-borrower-1",
                  first_name: "Test",
                  last_name: "Borrower",
                  phone: "123456789",
                  address: "123 Test St",
                  created_at: Date.now(),
                  updated_at: Date.now(),
                  _status: 'created',
                  _changed: ''
              }
          ]
      }
  };
  fs.writeFileSync('temp_backup.json', JSON.stringify(fakeBackup));

  console.log('Clicking Restore from File...');
  await page.locator('text=Restore from File').click();
  await page.waitForTimeout(500);

  console.log('Waiting for file chooser...');
  // Intercept the file chooser
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('text=Wipe & Restore').click(),
  ]);

  console.log('Uploading file...');
  await fileChooser.setFiles('temp_backup.json');

  console.log('Waiting to see what happens...');
  await page.waitForTimeout(3000);
  
  await browser.close();
  console.log('Done test');
})();
