/**
 * Loading and feedback behaviour: skeletons while the first response is
 * pending, errors with a working Retry instead of misleading empty states,
 * duplicate-submit protection and values kept after a failed submit.
 * API calls are answered by fixtures; individual endpoints are delayed or
 * failed per test.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { bodyFor, type Role } from './fixtures';
import { openView } from './nav';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

type Override = (route: Route, path: string, method: string) => Promise<boolean> | boolean;

/** Signed-in app for `role`; `override` may answer a request itself (return true). */
async function app(page: Page, role: Role, override: Override = () => false) {
  await page.route('**/socket.io/**', (r) => r.abort());
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (await override(route, path, req.method())) return;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(bodyFor(path, role)) });
  });
}

const fail = (route: Route, status = 500) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'boom' }) });

test('parent results show a skeleton until the response arrives, then the empty state', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await app(page, 'parent', async (route, path) => {
    if (!path.includes('/marks/student/')) return false;
    await gate;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    return true;
  });
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await openView(page, 'results');

  await expect(page.getByRole('status').filter({ hasText: 'Loading exam results…' })).toBeVisible();
  await expect(page.getByText(/no .*results/i)).toHaveCount(0);

  release();
  await expect(page.getByRole('status').filter({ hasText: 'Loading exam results…' })).toHaveCount(0);
});

test('a failed load shows an error with Retry, and Retry recovers', async ({ page }) => {
  let attempts = 0;
  await app(page, 'parent', async (route, path) => {
    if (!path.includes('/feedbacks/student/')) return false;
    attempts++;
    if (attempts <= 2) { await fail(route); return true; } // initial load (+ refresh on view open)
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    return true;
  });
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await openView(page, 'feedback');

  const alert = page.getByRole('alert').filter({ hasText: 'Couldn’t load this' }).first();
  await expect(alert).toBeVisible();
  await expect(page.getByText('No feedback submitted yet.')).toHaveCount(0);

  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('No feedback submitted yet.')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Couldn’t load this' })).toHaveCount(0);
});

test('admin leave requests: error + retry instead of "No leave applications"', async ({ page }) => {
  let ok = false;
  await app(page, 'admin', async (route, path) => {
    if (!/\/leaves$/.test(path)) return false;
    if (!ok) { await fail(route); return true; }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    return true;
  });
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await openView(page, 'leaves');

  const table = page.locator('table');
  await expect(table.getByText('Leave requests couldn’t be loaded.')).toBeVisible();
  await expect(table.getByText('No leave applications')).toHaveCount(0);

  ok = true;
  await table.getByRole('button', { name: 'Retry' }).click();
  await expect(table.getByText('No leave applications')).toBeVisible();
});

test('admin dashboard never shows placeholder figures while attendance is loading or failed', async ({ page }) => {
  await app(page, 'admin', async (route, path) => {
    if (!path.includes('/dashboard/attendance-today')) return false;
    await fail(route);
    return true;
  });
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await expect(page.getByText('Today’s attendance couldn’t be loaded.')).toBeVisible();
  await expect(page.getByText('94.2%')).toHaveCount(0);
});

test('a slow submit shows progress, blocks a second submit and keeps values on failure', async ({ page }) => {
  let posts = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await app(page, 'parent', async (route, path, method) => {
    if (method !== 'POST' || !/\/feedbacks$/.test(path)) return false;
    posts++;
    await gate;
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Server unavailable' }) });
    return true;
  });
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await openView(page, 'feedback');

  const form = page.locator('form').filter({ has: page.getByPlaceholder(/Transport timing, Homework difficulty/) });
  await form.getByPlaceholder(/Transport timing, Homework difficulty/).fill('Bus timing');
  await form.getByPlaceholder(/describe your query/i).fill('The bus arrives late.');
  const submit = form.locator('button[type="submit"]');
  await submit.click();
  await expect(form).toHaveAttribute('aria-busy', 'true');
  await submit.click({ force: true }).catch(() => {});
  await form.evaluate((f: HTMLFormElement) => f.requestSubmit());

  release();
  await expect(form).not.toHaveAttribute('aria-busy', 'true');
  expect(posts).toBe(1);
  await expect(form.getByPlaceholder(/Transport timing, Homework difficulty/)).toHaveValue('Bus timing');
  await expect(submit).toBeEnabled();
});

test('the shared data load failing shows a Retry bar instead of silently empty lists', async ({ page }) => {
  let failStudents = true;
  await app(page, 'admin', async (route, path) => {
    if (!path.includes('/dashboard/students') || !failStudents) return false;
    await fail(route, 503);
    return true;
  });
  await page.setViewportSize(PHONE);
  await page.goto('/');
  const bar = page.getByRole('alert').filter({ hasText: 'Some school records couldn’t be loaded' });
  await expect(bar).toBeVisible();

  failStudents = false;
  await bar.getByRole('button', { name: 'Retry' }).click();
  await expect(bar).toHaveCount(0);
});

test('skeletons and error states fit narrow phones without horizontal overflow', async ({ page }) => {
  await app(page, 'parent', async (route, path) => {
    if (!path.includes('/marks/student/')) return false;
    await fail(route);
    return true;
  });
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.locator('.shell-tabbar [data-nav="results"]').waitFor();
    await openView(page, 'results');
    await expect(page.getByRole('alert').filter({ hasText: 'Couldn’t load this' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(0);
  }
});

test('reduced motion stops the skeleton shimmer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const gate = new Promise<void>(() => {});
  await app(page, 'parent', async (route, path) => {
    if (!path.includes('/marks/student/')) return false;
    await gate;
    return true;
  });
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await openView(page, 'results');
  const shimmer = await page.locator('.skeleton').first().evaluate((el) => getComputedStyle(el, '::after').display);
  expect(shimmer).toBe('none');
});
