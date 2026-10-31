/**
 * Regression tests for the workflows the redesign must not break: sign-in
 * (payload + role routing), sign-out, navigation to every permitted screen on
 * phone and desktop, in-app back behaviour, permission gating, the theme
 * toggle, and attendance submission. API calls are answered by fixtures and
 * recorded so request contracts can be asserted.
 */
import { test, expect, type Page, type Request } from '@playwright/test';
import { bodyFor, mockApi, userFor, type Role } from './fixtures';
import { openView, VIEWS } from './nav';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

/** Signed-out app whose /auth/login succeeds for `role`; records API requests. */
async function signedOutApp(page: Page, role: Role, requests: Request[]) {
  let signedIn = false;
  await page.route('**/socket.io/**', (r) => r.abort());
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    requests.push(req);
    const path = new URL(req.url()).pathname;
    if (path.endsWith('/auth/refresh') && !signedIn) {
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{"success":false}' });
    }
    if (path.endsWith('/auth/login')) {
      signedIn = true;
      const u = userFor(role)!;
      const user = { ...u, id: u._id, name: `${u.firstName} ${u.lastName}` };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, accessToken: 't', user }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(bodyFor(path, role)) });
  });
}

for (const role of ['admin', 'teacher', 'parent'] as const) {
  test(`${role} signs in with the original payload and lands in their portal`, async ({ page }) => {
    const requests: Request[] = [];
    await signedOutApp(page, role, requests);
    await page.setViewportSize(PHONE);
    await page.goto('/');

    const tabLabel = role === 'admin' ? 'Admin' : role === 'teacher' ? 'Teacher' : 'Parent';
    await page.getByRole('tab', { name: tabLabel }).click();
    await page.locator('#login-username').fill('user-1');
    await page.locator('#login-password').fill('secret-pw');
    await page.getByRole('button', { name: /sign in/i }).click();

    const login = requests.find((r) => r.url().endsWith('/auth/login'))!;
    expect(login.method()).toBe('POST');
    expect(login.postDataJSON()).toEqual({ username: 'user-1', password: 'secret-pw' });
    await expect(page.locator(`.shell[data-role="${role}"]`)).toBeVisible();
    await expect(page.locator('.shell-tabbar')).toBeVisible();
  });
}

test('signing in with the wrong portal shows an error and stays on login', async ({ page }) => {
  const requests: Request[] = [];
  await signedOutApp(page, 'teacher', requests);
  await page.goto('/');
  await page.getByRole('tab', { name: 'Parent' }).click();
  await page.locator('#login-username').fill('lakshmi');
  await page.locator('#login-password').fill('pw');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('alert')).toContainText('not registered as a parent');
  await expect(page.locator('.shell')).toHaveCount(0);
});

test('password visibility toggle is labelled and works', async ({ page }) => {
  await signedOutApp(page, 'admin', []);
  await page.goto('/');
  const pw = page.locator('#login-password');
  await expect(pw).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(pw).toHaveAttribute('type', 'text');
});

for (const role of ['admin', 'teacher', 'parent', 'superadmin'] as Role[]) {
  test(`${role}: every screen is reachable from the phone tab bar or More sheet`, async ({ page }) => {
    await mockApi(page, role);
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await page.waitForSelector('.shell');
    for (const key of VIEWS[role]) {
      await openView(page, key);
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
      const active = page.locator(`.shell-tabbar [data-nav="${key}"][aria-current="page"], .shell-tabbar [data-nav="__more"].is-active`);
      await expect(active.first()).toBeVisible();
    }
  });

  test(`${role}: every screen is reachable from the desktop sidebar`, async ({ page }) => {
    await mockApi(page, role);
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await page.waitForSelector('.shell');
    for (const key of VIEWS[role]) {
      await openView(page, key);
      await expect(page.locator(`aside [data-nav="${key}"]`)).toHaveAttribute('aria-current', 'page');
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
    }
  });
}

test('phone back button returns home and More sheet closes with Escape', async ({ page }) => {
  await mockApi(page, 'teacher');
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await page.waitForSelector('.shell');
  await openView(page, 'homework');
  await expect(page.locator('.shell-appbar-heading')).toHaveText('Homework Board');
  await page.getByRole('button', { name: 'Back to home' }).click();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible();

  await page.locator('.shell-tabbar [data-nav="__more"]').click();
  await expect(page.getByRole('dialog', { name: 'All sections' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'All sections' })).toHaveCount(0);
});

test('sign out from the More sheet calls /auth/logout and returns to login', async ({ page }) => {
  const requests: Request[] = [];
  await page.route('**/socket.io/**', (r) => r.abort());
  let loggedOut = false;
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    requests.push(req);
    const path = new URL(req.url()).pathname;
    if (path.endsWith('/auth/logout')) loggedOut = true;
    if (path.endsWith('/auth/refresh') && loggedOut) return route.fulfill({ status: 401, body: '{}' });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(bodyFor(path, 'parent')) });
  });
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await page.waitForSelector('.shell');
  await page.locator('.shell-tabbar [data-nav="__more"]').click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  expect(requests.some((r) => r.url().endsWith('/auth/logout') && r.method() === 'POST')).toBe(true);
  await expect(page.locator('#login-username')).toBeVisible();
});

test('custom employee only sees screens their permissions allow', async ({ page }) => {
  await page.route('**/socket.io/**', (r) => r.abort());
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/auth/me')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, user: { _id: 'e1', role: 'other', firstName: 'Fee', lastName: 'Clerk', permissions: ['fees:view', 'students:read'] } }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(bodyFor(path, 'admin')) });
  });
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await page.waitForSelector('.shell');
  const keys = await page.locator('aside [data-nav]').evaluateAll((els) => els.map((e) => e.getAttribute('data-nav')));
  expect(keys.sort()).toEqual(['fee-analytics', 'reminders', 'students'].sort());
  // No dashboard permission: lands on the first permitted screen instead
  await expect(page.locator('aside [aria-current="page"]')).toHaveAttribute('data-nav', 'fee-analytics');
  // Settings is hidden without settings:manage
  await page.getByRole('button', { name: /Account:/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Settings' })).toHaveCount(0);
});

test('theme toggle switches to dark mode and persists', async ({ page }) => {
  await mockApi(page, 'admin');
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await page.waitForSelector('.shell');
  await page.getByRole('button', { name: /Account:/ }).click();
  await page.getByRole('menuitem', { name: 'Dark mode' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
});

test('teacher submits attendance with the original request contract', async ({ page }) => {
  const posts: Request[] = [];
  await page.route('**/socket.io/**', (r) => r.abort());
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === 'POST' && path.endsWith('/attendance')) posts.push(req);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(bodyFor(path, 'teacher')) });
  });
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await page.waitForSelector('.shell');
  await page.getByRole('button', { name: /Mark attendance now/ }).click();
  const fab = page.locator('.mobile-submit-fab');
  await expect(fab).toBeVisible();
  // The floating submit button must not sit under the tab bar
  const fabBox = (await fab.boundingBox())!;
  const barBox = (await page.locator('.shell-tabbar').boundingBox())!;
  expect(fabBox.y + fabBox.height).toBeLessThanOrEqual(barBox.y);
  await fab.click();
  const confirm = page.getByRole('button', { name: /confirm|submit|yes/i }).last();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect.poll(() => posts.length).toBeGreaterThan(0);
  const body = posts[0].postDataJSON();
  expect(Object.keys(body).sort()).toEqual(['class', 'classTeacherId', 'date', 'records', 'sendAlerts'].sort());
  expect(Array.isArray(body.records)).toBe(true);
});

test('toasts on phones appear above the tab bar', async ({ page }) => {
  await mockApi(page, 'admin');
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await page.waitForSelector('.shell');
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'toast-notification';
    el.textContent = 'probe';
    document.body.appendChild(el);
  });
  // Measure the resting position, after the slide-in animation
  await page.locator('.toast-notification').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const t = (await page.locator('.toast-notification').boundingBox())!;
  const bar = (await page.locator('.shell-tabbar').boundingBox())!;
  expect(t.y + t.height).toBeLessThanOrEqual(bar.y);
});
