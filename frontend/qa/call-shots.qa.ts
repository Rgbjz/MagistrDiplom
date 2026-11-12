/**
 * Headless screenshots of the call UI at several sizes:
 *   npx tsx qa/call-shots.qa.ts [direct-conversation-id] [course-conversation-id]
 */
import { chromium, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:3055';
const DIRECT = process.argv[2] ?? '132';
const COURSE = process.argv[3] ?? '126';
const OUT = path.join(__dirname, 'artifacts', 'call-ui');
mkdirSync(OUT, { recursive: true });

const SIZES = [
  { name: '800x900', width: 800, height: 900 },
  { name: '1440x800', width: 1440, height: 800 },
  { name: '720x860', width: 720, height: 860 },
  { name: '390x760', width: 390, height: 760 },
];

async function user(browser: Browser, email: string, size: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport: size, permissions: ['camera', 'microphone'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', email, e.message));
  await page.goto(`${BASE}/login`);
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill('demo1234');
  await page.locator('button[type=submit]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
  return page;
}

async function shot(page: Page, name: string) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  const overflow = await page.evaluate(() => {
    const ctrl = document.querySelector('[role=toolbar]')?.getBoundingClientRect();
    return {
      hScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      controlsBottom: ctrl ? Math.round(ctrl.bottom) : null,
      vh: window.innerHeight,
    };
  });
  console.log(name, JSON.stringify(overflow));
}

async function remoteVideo(page: Page) {
  await page.waitForFunction(
    () => (document.querySelector<HTMLVideoElement>('video[data-peer]')?.videoWidth ?? 0) > 0,
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(800);
}

async function hangUpAll(...pages: Page[]) {
  for (const p of pages) {
    const btn = p.getByRole('button', { name: /Завершити дзвінок|Скасувати/ });
    if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => undefined);
  }
  await pages[0].waitForTimeout(2500);
}

(async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  for (const size of SIZES) {
    const teacher = await user(browser, 'teacher1@lms.local', size);
    const student = await user(browser, 'student@lms.local', size);
    await teacher.goto(`${BASE}/chat?c=${DIRECT}`);
    await student.goto(`${BASE}/chat?c=${DIRECT}`);
    await teacher.getByRole('button', { name: 'Відеодзвінок', exact: true }).click();
    await teacher.waitForTimeout(1200);
    await shot(teacher, `${size.name}-1-calling`);
    await student.getByRole('alertdialog').waitFor();
    await student.waitForTimeout(500);
    await shot(student, `${size.name}-2-incoming`);
    await student.getByRole('button', { name: 'Прийняти' }).click();
    await remoteVideo(teacher);
    await remoteVideo(student);
    await shot(teacher, `${size.name}-3-connected-teacher`);
    await shot(student, `${size.name}-3-connected-student`);
    await student.getByRole('button', { name: 'Вимкнути камеру' }).click();
    await student.getByRole('button', { name: 'Вимкнути мікрофон' }).click();
    await teacher.waitForTimeout(1500);
    await shot(teacher, `${size.name}-4-camera-off`);
    await student.getByRole('button', { name: 'Завершити дзвінок' }).click();
    await teacher.waitForTimeout(400);
    await shot(student, `${size.name}-5-ended`);
    await hangUpAll(teacher, student);
    await teacher.context().close();
    await student.context().close();
  }

  // Group of three via the course chat.
  for (const size of [SIZES[1], SIZES[0], SIZES[3]]) {
    const teacher = await user(browser, 'teacher1@lms.local', size);
    const s1 = await user(browser, 'student@lms.local', size);
    const s2 = await user(browser, 'student2@lms.local', size);
    for (const p of [teacher, s1, s2]) await p.goto(`${BASE}/chat?c=${COURSE}`);
    await teacher.getByRole('button', { name: 'Відеодзвінок', exact: true }).click();
    await teacher.waitForTimeout(1200);
    await shot(teacher, `${size.name}-6-group-waiting`);
    for (const s of [s1, s2]) {
      const accept = s.getByRole('button', { name: 'Прийняти' });
      await accept.waitFor({ timeout: 15_000 });
      if (s === s1) await shot(s, `${size.name}-6-group-incoming`);
      await accept.click();
      await remoteVideo(s);
    }
    await teacher.waitForTimeout(3000);
    await shot(teacher, `${size.name}-7-group-teacher`);
    await shot(s2, `${size.name}-7-group-student2`);
    await hangUpAll(s1, s2, teacher);
    for (const p of [teacher, s1, s2]) await p.context().close();
  }
  await browser.close();
})();
