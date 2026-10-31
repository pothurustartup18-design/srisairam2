/** Shared navigation helpers for browser tests. */
import type { Page } from '@playwright/test';
import type { Role } from './fixtures';

export const VIEWS: Record<Role, string[]> = {
  admin: ['dashboard', 'fee-analytics', 'reminders', 'expenditures', 'students', 'teachers', 'leaves', 'attendance', 'marks', 'homework', 'messages', 'events', 'feedbacks'],
  teacher: ['home', 'attendance', 'marks', 'students', 'analytics', 'homework', 'messages', 'notices', 'fees', 'leaves', 'delegations', 'signature'],
  parent: ['dashboard', 'attendance', 'results', 'fees', 'homework', 'notices', 'profile', 'messages', 'feedback'],
  superadmin: ['dashboard', 'database', 'whatsapp', 'sessions', 'audit', 'flags', 'queues', 'redis', 'collections'],
};

/** Opens a view through the navigation a user sees at the current width. */
export async function openView(page: Page, key: string) {
  const width = page.viewportSize()!.width;
  if (width >= 768) {
    await page.locator(`aside [data-nav="${key}"]`).click();
  } else {
    // A full-screen chat covers the tab bar on phones; leave it via its back button first
    const chatBack = page.locator('.am-chat-pane:not(.am-chat-pane--hidden-mobile) .am-back-btn');
    if (await chatBack.isVisible().catch(() => false)) await chatBack.click();
    const tab = page.locator(`.shell-tabbar [data-nav="${key}"]`);
    if (await tab.count()) {
      await tab.click();
    } else {
      await page.locator('.shell-tabbar [data-nav="__more"]').click();
      await page.locator(`.shell-sheet [data-nav="${key}"]`).click();
    }
  }
  await page.waitForTimeout(500);
}
