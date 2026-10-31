/**
 * Interactive preview, not a test: opens a phone-sized browser signed in as
 * PREVIEW_ROLE (admin | teacher | parent | superadmin; default teacher) with
 * fixture data, and stays open until you close the window.
 *
 *   PREVIEW=1 PREVIEW_ROLE=parent E2E_DEV=1 npx playwright test e2e/preview.spec.ts --headed
 */
import { test, devices } from '@playwright/test';
import { mockApi, type Role } from './fixtures';

const role = (process.env.PREVIEW_ROLE || 'teacher') as Role;
const { defaultBrowserType: _ignored, ...pixel } = devices['Pixel 7'];

test.use({ ...pixel });
test.skip(!process.env.PREVIEW, 'Interactive preview; set PREVIEW=1 to run');

test(`preview ${role} on a phone`, async ({ page }) => {
  test.setTimeout(0);
  await mockApi(page, role);
  await page.goto('/');
  await page.waitForEvent('close', { timeout: 0 });
});
