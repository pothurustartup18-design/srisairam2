import { defineConfig } from '@playwright/test';

// Browser tests run against a production build served by `vite preview`, with
// every /api call answered by e2e/fixtures.ts — no backend needed, and editing
// source files while tests run cannot disturb them. Set E2E_DEV=1 to test the
// dev server instead.
const dev = !!process.env.E2E_DEV;

export default defineConfig({
  testDir: './e2e',
  timeout: 400_000,
  fullyParallel: true,
  workers: 3,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'off',
    actionTimeout: 10_000,
  },
  webServer: {
    command: dev
      ? 'npx vite --port 5199 --strictPort'
      : 'npx vite build --outDir .e2e-dist --emptyOutDir && npx vite preview --outDir .e2e-dist --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
