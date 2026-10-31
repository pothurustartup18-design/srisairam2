/**
 * Responsive audit: for every role, view and required viewport, loads the app
 * fresh at that size, navigates the way a user would at that width (sidebar on
 * tablet/desktop, tab bar or "More" sheet on phones) and checks for content
 * sticking out past the viewport. Results are written as JSON (and
 * screenshots, when AUDIT_SHOTS is set) to AUDIT_OUT.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { mockApi, mockSignedOut, findOverflow, VIEWPORTS, type Role } from './fixtures';
import { VIEWS, openView } from './nav';

const OUT = process.env.AUDIT_OUT || path.resolve('test-results/audit');
const SHOTS = !!process.env.AUDIT_SHOTS;
const SHOT_SIZES = new Set(['360x800', '390x844', '768x1024', '1440x900']);
const ONLY = process.env.AUDIT_SIZES?.split(',');

async function measure(page: Page, key: string, w: number, h: number, results: Record<string, unknown>) {
  const r = await findOverflow(page);
  const crashed = await page.getByText('Something went wrong').count();
  if (crashed) results[`${key} @${w}x${h}`] = { crashed: (await page.locator('pre, p').allInnerTexts()).join(' ').slice(0, 300) };
  else if (r.docOverflow || r.elements.length) results[`${key} @${w}x${h}`] = r;
  if (SHOTS && SHOT_SIZES.has(`${w}x${h}`)) {
    fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
    await page.screenshot({ path: path.join(OUT, 'shots', `${key.replace(/[^a-z0-9]+/gi, '_')}-${w}x${h}.png`) });
  }
}

const sizes = VIEWPORTS.filter(([w, h]) => !ONLY || ONLY.includes(`${w}x${h}`));

test('login screens', async ({ page }) => {
  const results: Record<string, unknown> = {};
  await mockSignedOut(page);
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    for (const [route, key] of [['/', 'login'], ['/superadmin', 'superadmin-login']]) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await measure(page, key, w, h, results);
    }
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'login.json'), JSON.stringify(results, null, 2));
});

for (const role of ['admin', 'teacher', 'parent', 'superadmin'] as Role[]) {
  test(`${role} portal views`, async ({ page }) => {
    test.setTimeout(900_000);
    const results: Record<string, unknown> = {};
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await mockApi(page, role);
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await page.waitForSelector('.shell');
      await page.waitForTimeout(500);
      for (const key of VIEWS[role]) {
        try {
          await openView(page, key);
          await expect(page.locator('.shell-content')).toBeVisible();
          await measure(page, `${role}-${key}`, w, h, results);
        } catch (e) {
          results[`${role}-${key} @${w}x${h}`] = { navError: String(e).slice(0, 300) };
        }
      }
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `${role}.json`), JSON.stringify({ errors, results }, null, 2));
  });
}
