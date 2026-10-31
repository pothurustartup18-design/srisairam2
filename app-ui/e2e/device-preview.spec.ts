/**
 * Checks the dev-only device preview page (device-preview.html): the app loads
 * inside the phone frame, Back runs the app's back-button stack, Forward
 * re-opens the screen, and device switching resizes the frame.
 * Needs the dev server (the back hook is dev-only): E2E_DEV=1.
 */
import { test, expect } from '@playwright/test';
import { mockApi } from './fixtures';

test.skip(!process.env.E2E_DEV, 'device-preview.html is served by the dev server only');

test('device preview: back, forward, device switch', async ({ page }) => {
  await mockApi(page, 'teacher');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/device-preview.html');
  const app = page.frameLocator('#app');
  await expect(app.locator('.shell')).toBeVisible();

  // Phone layout inside the frame
  await expect(app.locator('.shell-tabbar')).toBeVisible();
  await app.locator('.shell-tabbar [data-nav="attendance"]').click();
  await expect(page.locator('#status')).toContainText('Attendance');

  await page.getByRole('button', { name: 'Back', exact: true }).first().click();
  await expect(page.locator('#status')).toContainText('home');
  await expect(page.locator('#fwdBtn')).toBeEnabled();

  await page.locator('#fwdBtn').click();
  await expect(page.locator('#status')).toContainText('Attendance');

  // Back also closes the More sheet before leaving a screen
  await app.locator('.shell-tabbar [data-nav="__more"]').click();
  await expect(app.getByRole('dialog', { name: 'All sections' })).toBeVisible();
  await page.locator('.panel [data-act="back"]').click();
  await expect(app.getByRole('dialog', { name: 'All sections' })).toHaveCount(0);

  // Device switch resizes the app viewport
  await page.locator('.device-opt[data-id="se"]').click();
  await expect(page.locator('#app')).toHaveCSS('width', '320px');
  await page.screenshot({ path: 'test-results/device-preview.png' });
});
