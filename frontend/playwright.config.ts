import { defineConfig, devices } from '@playwright/test';

/**
 * UI end-to-end tests. They drive a running frontend + backend seeded with
 * the demo data (backend: `npm run db:seed`). Defaults match the local demo
 * setup; override with E2E_BASE_URL / E2E_API_URL.
 *
 * Playwright's bundled Chromium doesn't support macOS 12, so the installed
 * Google Chrome is used (channel: 'chrome').
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3055';

export default defineConfig({
  testDir: './e2e',
  // Specs share one seeded database, so run them one at a time.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'e2e-report', open: 'never' }]],
  use: {
    baseURL,
    channel: 'chrome',
    locale: 'uk-UA',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Playwright's ffmpeg isn't available on macOS 12; traces + screenshots suffice.
    video: 'off',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' }, testMatch: /mobile\.spec/ },
  ],
});
