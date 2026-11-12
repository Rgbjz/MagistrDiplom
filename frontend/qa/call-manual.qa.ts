/**
 * Opens two visible windows side by side for manual call testing:
 * left = teacher1 (real camera/mic), right = student (fake media stream).
 * Both land in their direct chat. Windows stay open until closed by hand.
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3055';
const CHAT = process.argv[2] ?? '';

async function open(x: number, who: { email: string; password: string }, fake: boolean) {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: [
      `--window-position=${x},0`,
      '--window-size=720,900',
      ...(fake ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] : []),
    ],
  });
  const ctx = await browser.newContext({
    // Follow the real window size, so maximising/resizing the window works.
    viewport: null,
    permissions: ['camera', 'microphone'],
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.locator('input[type=email]').fill(who.email);
  await page.locator('input[autocomplete="current-password"]').fill(who.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  await page.goto(`${BASE}/chat${CHAT ? `?c=${CHAT}` : ''}`);
  browser.on('disconnected', () => process.exit(0));
  return browser;
}

(async () => {
  await open(0, { email: 'teacher1@lms.local', password: 'demo1234' }, false);
  await open(720, { email: 'student@lms.local', password: 'demo1234' }, true);
  console.log('Both windows are ready. Close a window to finish.');
  await new Promise(() => undefined);
})();
