/**
 * Area 2 — student journey in ONE visible window / ONE page:
 * fresh student (enroll, lessons, video, files, test, assignment, grades,
 * request, purchase, calendar, notifications, chat, profile, delete account),
 * then the seeded demo student (dashboard, my courses, certificate, grades),
 * then one extra context for mobile / dark / en / pl.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { API, BASE, DEMO, QA } from './harness';
import { api, apiToken, fixtures, step } from './ta-common';
import { overflowCulprits, pause } from './util';

const WEB = 152; // Основи веб-розробки (free)
const FLEX = 322; // lesson with test 132 + assignment 88
const JS_TEST = 133; // SINGLE / MULTIPLE / TRUE_FALSE / SHORT_TEXT / MATCHING
const APPROVAL = 154; // Бази даних і SQL
const PAID = 157; // Англійська для IT

async function setupLessonMedia(f: ReturnType<typeof fixtures>) {
  const t = await apiToken(DEMO.teacher1.email, DEMO.teacher1.password);
  const course = await api<{ sections: { lessons: { id: number; files?: unknown[] }[] }[] }>(`/courses/${WEB}`, t);
  const lesson = course.sections.flatMap((s) => s.lessons).find((l) => l.id === FLEX)!;
  if (!lesson.files?.length) {
    for (const [file, type] of [
      [f.notes, 'text/markdown'],
      [f.pdf, 'application/pdf'],
    ] as const) {
      const form = new FormData();
      form.append('file', new Blob([readFileSync(file)], { type }), path.basename(file));
      await api(`/lessons/${FLEX}/files`, t, { method: 'POST', body: form });
    }
  }
  const cur = await api<{ video: { status: string } | null }>(`/lessons/${FLEX}/video`, t).catch(() => ({ video: null }));
  if (cur.video?.status !== 'READY') {
    const bytes = readFileSync(f.video);
    const up = await api<{ uploadId: string; chunkSize: number }>(`/lessons/${FLEX}/video/uploads`, t, {
      method: 'POST',
      body: JSON.stringify({ size: bytes.length, mime: 'video/mp4', name: 'qa-lesson.mp4' }),
    });
    for (let i = 0, off = 0; off < bytes.length; i++, off += up.chunkSize) {
      const r = await fetch(`${API}/videos/uploads/${up.uploadId}/chunks/${i}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/octet-stream' },
        body: bytes.subarray(off, off + up.chunkSize),
      });
      if (!r.ok) throw new Error(`chunk ${i}: ${r.status}`);
    }
    await api(`/videos/uploads/${up.uploadId}/complete`, t, { method: 'POST' });
    for (let i = 0; i < 60; i++) {
      const v = await api<{ video: { status: string } | null }>(`/lessons/${FLEX}/video`, t);
      if (v.video?.status === 'READY') break;
      await pause(2000);
    }
  }
}

async function nav(page: Page, url: string) {
  await page.goto(`${BASE}${url}`);
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

async function logout(page: Page, qa: QA) {
  await page.getByRole('button', { name: 'Меню користувача' }).click();
  await qa.snap(page, 'user-menu', { axe: false, fullPage: false });
  await page.getByRole('menuitem', { name: /Вийти/ }).click();
  await page.waitForURL((u) => /\/(welcome|login)/.test(u.pathname) || u.pathname === '/', { timeout: 15_000 });
}

async function main() {
  const f = fixtures();
  const qa = new QA('student', 'full');
  await setupLessonMedia(f).catch((e) => qa.add('setup', 'note', 'info', `media setup: ${(e as Error).message}`));
  const user = await qa.freshUser('stud');
  await qa.start();
  const ctx = await qa.context();
  const page = await qa.page(ctx, 'student');
  page.setDefaultTimeout(15_000);
  const s = (name: string, fn: () => Promise<void>) => step(qa, page, name, fn);

  await s('login-fresh', async () => {
    await qa.login(page, user.email, user.password);
    await qa.snap(page, 'dashboard-empty');
  });

  // ---------- enroll + lessons ----------
  await s('enroll-free', async () => {
    await nav(page, `/c/${WEB}`);
    await qa.snap(page, 'landing-before-enroll');
    await page.getByRole('button', { name: 'Почати навчання' }).click();
    await page.waitForURL(new RegExp(`/courses/${WEB}`));
    await page.getByRole('navigation', { name: 'Зміст курсу' }).waitFor();
    await qa.snap(page, 'course-first-lesson');
  });

  await s('complete-and-next', async () => {
    const progress = page.getByRole('progressbar', { name: 'Прогрес курсу' }).first();
    const before = await progress.getAttribute('aria-valuenow');
    await page.getByRole('button', { name: 'Завершити і далі' }).click();
    await pause(1500);
    const after = await progress.getAttribute('aria-valuenow');
    if (before === after) qa.add('complete-and-next', 'bug', 'major', `progress did not change (${before} → ${after})`);
    await qa.snap(page, 'course-after-complete');
    // second lesson has a test: open it, don't start yet
    await page.getByRole('button', { name: 'Завершити і далі' }).click().catch(() => undefined);
    await pause(800);
    await qa.snap(page, 'course-next-item', { axe: false });
  });

  await s('lesson-video-files', async () => {
    await nav(page, `/courses/${WEB}?lesson=${FLEX}`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    const video = page.locator('video').first();
    if (await video.count()) {
      await video.scrollIntoViewIfNeeded();
      await video.evaluate((v: HTMLVideoElement) => {
        v.muted = true;
        return v.play();
      }).catch(() => undefined);
      await pause(3500);
      const st = await video.evaluate((v: HTMLVideoElement) => ({ t: v.currentTime, err: v.error?.code ?? null, rs: v.readyState }));
      if (st.err || st.t < 0.5) qa.add('lesson-video', 'bug', 'major', `video did not play: ${JSON.stringify(st)}`);
    } else {
      qa.add('lesson-video', 'note', 'minor', 'no <video> element on lesson with uploaded video');
    }
    await qa.snap(page, 'lesson-video');
    const files = page.locator('section', { has: page.getByRole('heading', { name: 'Матеріали до уроку' }) });
    await files.scrollIntoViewIfNeeded();
    const link = files.getByRole('link').first();
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10_000 }), link.click()]);
    const name = dl.suggestedFilename();
    const p = path.join(qa.outDir, `dl-${name}`);
    await dl.saveAs(p);
    qa.add('lesson-files', 'note', 'info', `downloaded "${name}" (${readFileSync(p).length} B)`);
    await qa.snap(page, 'lesson-files', { axe: false });
  });

  // ---------- assignment ----------
  await s('assignment-submit', async () => {
    await nav(page, `/courses/${WEB}?assignment=88`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await qa.snap(page, 'assignment-open');
    const input = page.getByLabel('Файли роботи');
    await input.setInputFiles(f.evil);
    await pause(600);
    await qa.snap(page, 'assignment-bad-type', { axe: false });
    await input.setInputFiles([f.notes, f.pdf]);
    await page.getByLabel('Коментар до роботи').fill('Робота QA: кирилиця в назві файлу');
    await page.getByRole('button', { name: 'Здати роботу' }).click();
    await page.getByText('Роботу здано').first().waitFor();
    await qa.snap(page, 'assignment-submitted');
    await page.getByRole('button', { name: 'Здати повторно' }).click();
    await pause(500);
    await page.getByLabel('Файли роботи').setInputFiles(f.pdf);
    await qa.snap(page, 'assignment-resubmit-form', { axe: false });
    await page.getByRole('button', { name: /^Здати/ }).last().click();
    await pause(1500);
    await qa.snap(page, 'assignment-resubmitted', { axe: false });
  });

  // ---------- test with all seeded types ----------
  await s('test-js-all-types', async () => {
    await nav(page, `/courses/${WEB}?test=${JS_TEST}`);
    await qa.snap(page, 'test-intro');
    await page.getByRole('button', { name: 'Почати тест' }).click();
    await page.getByRole('timer').waitFor();
    const counter = page.getByText(/^Питання \d+ з \d+$/);
    const total = Number((await counter.textContent())!.match(/з (\d+)/)![1]);
    const next = page.getByRole('button', { name: /^Наступне/ });
    for (let i = 0; i < total; i++) {
      await page.getByText(`Питання ${i + 1} з ${total}`).waitFor();
      const short = page.getByLabel('Ваша відповідь', { exact: true });
      const selects = page.locator('fieldset select, main select');
      if (await short.count()) {
        await short.fill('const');
      } else if (await selects.count()) {
        const map: Record<string, string> = { click: 'натискання на елемент', input: 'зміна значення поля', submit: 'надсилання форми' };
        for (const [l, r] of Object.entries(map)) await page.getByLabel(l, { exact: true }).selectOption({ label: r });
      } else {
        // pick the correct-looking option per question text
        const q = (await page.locator('fieldset legend, fieldset').first().innerText()).toLowerCase();
        const pick = q.includes('примітив')
          ? ['string', 'boolean', 'number']
          : q.includes('querySelector'.toLowerCase())
            ? ['Неправда', 'Хибно', 'Ні']
            : q.includes('===')
              ? ['false']
              : q.includes('безпечно')
                ? ['Через textContent']
                : ['const'];
        let clicked = 0;
        for (const o of pick) {
          const b = page.locator('fieldset button[aria-pressed]', { hasText: new RegExp(`^\\s*${o}\\s*$`) });
          if (await b.count()) {
            await b.first().click();
            clicked++;
          }
        }
        if (!clicked) await page.locator('fieldset button[aria-pressed]').first().click();
      }
      if (i === 1) await qa.snap(page, 'test-question', { fullPage: false });
      if (i === 6 || (i === total - 1 && i < 6)) await qa.snap(page, 'test-matching', { fullPage: false, axe: false });
      if (i < total - 1) await next.click();
    }
    await qa.snap(page, 'test-before-finish', { axe: false, fullPage: false });
    await page.getByRole('button', { name: 'Завершити тест' }).last().click();
    const dlg = page.locator('dialog[open]');
    if (await dlg.isVisible().catch(() => false)) await dlg.getByRole('button', { name: 'Завершити' }).click();
    await page.waitForURL(/\/result$/);
    await qa.snap(page, 'test-result');
    const label = await page.getByLabel(/^Результат \d+ відсотків$/).getAttribute('aria-label');
    qa.add('test-result', 'note', 'info', `result: ${label}`);
    if (!/100/.test(label ?? '')) qa.add('test-result', 'note', 'minor', `all-correct answers gave ${label}`);
  });

  await s('test-exit-dialog', async () => {
    await page.getByRole('link', { name: 'Пройти ще раз' }).click();
    await page.getByRole('button', { name: 'Пройти ще раз' }).click();
    await page.getByRole('button', { name: 'Вийти з тесту' }).click();
    await qa.snap(page, 'test-exit-dialog', { fullPage: false });
    await page.locator('dialog[open]').getByRole('button', { name: 'Вийти', exact: true }).click();
  });

  await s('grades', async () => {
    await nav(page, `/courses/${WEB}/grades`);
    await qa.snap(page, 'grades-fresh');
  });

  // ---------- request + purchase ----------
  await s('approval-request', async () => {
    await nav(page, `/c/${APPROVAL}`);
    await page.getByRole('button', { name: 'Подати заявку' }).click();
    await page.getByText('Заявку надіслано викладачу').first().waitFor();
    await qa.snap(page, 'request-sent');
    await nav(page, '/my-courses?tab=pending');
    await qa.snap(page, 'my-courses-pending');
    await nav(page, `/courses/${APPROVAL}`);
    await page.getByText('Ви ще не записані на цей курс').waitFor({ timeout: 25_000 });
    await qa.snap(page, 'course-not-enrolled', { axe: false });
  });

  await s('purchase', async () => {
    await nav(page, `/c/${PAID}`);
    await page.getByRole('link', { name: /^Купити за/ }).click();
    await page.waitForURL(new RegExp(`/checkout/${PAID}$`));
    await qa.snap(page, 'checkout');
    await page.getByRole('button', { name: /^Оплатити/ }).click();
    await page.getByRole('heading', { name: /Оплата успішна/ }).waitFor();
    await qa.snap(page, 'checkout-success');
    await page.getByRole('link', { name: 'Історія покупок' }).click();
    await page.waitForURL(/\/purchases$/);
    await qa.snap(page, 'purchases');
    await page.getByRole('row', { name: /Англійська для IT/ }).getByRole('button', { name: 'Квитанція' }).click();
    await qa.snap(page, 'receipt', { fullPage: false });
    await page.locator('dialog[open]').getByRole('button', { name: /Закрити/ }).first().click();
    await nav(page, `/checkout/${PAID}`);
    await qa.snap(page, 'checkout-owned', { axe: false });
  });

  // ---------- calendar ----------
  await s('calendar', async () => {
    await nav(page, '/calendar');
    await qa.snap(page, 'calendar-month');
    await page.getByRole('button', { name: 'Наступний місяць' }).click();
    await pause(500);
    await page.getByRole('button', { name: 'Сьогодні' }).click();
    await page.getByRole('button', { name: 'Список' }).click();
    await qa.snap(page, 'calendar-agenda');
    await page.getByRole('button', { name: 'Підписатися в Google Calendar' }).click();
    await pause(800);
    await qa.snap(page, 'calendar-ical-modal', { fullPage: false });
    await page.keyboard.press('Escape');
  });

  // ---------- notifications ----------
  await s('notifications', async () => {
    await nav(page, '/notifications');
    await qa.snap(page, 'notifications');
    const tabs = page.getByRole('tablist', { name: 'Фільтр сповіщень' });
    await tabs.getByRole('tab', { name: /Непрочитані/ }).click();
    await pause(400);
    await tabs.getByRole('tab', { name: 'Тести' }).click();
    await qa.snap(page, 'notifications-tests', { axe: false });
    await tabs.getByRole('tab', { name: 'Усі' }).click();
    const list = page.getByRole('region', { name: 'Список сповіщень' });
    if (await list.getByRole('button').count()) {
      await list.getByRole('button').first().click();
      await pause(1200);
      await qa.snap(page, 'notification-opened', { axe: false });
      await nav(page, '/notifications');
    }
    const all = page.getByRole('button', { name: 'Позначити всі як прочитані' });
    if (await all.isEnabled().catch(() => false)) await all.click();
    await pause(800);
    await qa.snap(page, 'notifications-all-read', { axe: false });
  });

  // ---------- chat ----------
  await s('chat', async () => {
    await nav(page, `/courses/${WEB}`);
    await page.getByRole('button', { name: 'Чат курсу' }).first().click();
    await page.waitForURL(/\/chat\?c=\d+/);
    const text = `QA повідомлення ${Date.now().toString(36)} — привіт 👋`;
    await page.getByRole('textbox', { name: 'Повідомлення' }).pressSequentially(text.slice(0, 20));
    await page.getByRole('textbox', { name: 'Повідомлення' }).fill(text);
    await page.getByRole('button', { name: 'Надіслати' }).click();
    await page.locator('[aria-live="polite"]').getByText(text).waitFor();
    await qa.snap(page, 'chat-course');
    const list = page.getByRole('complementary', { name: 'Розмови' });
    const direct = list.getByRole('button', { name: /Ірина Мельник/ });
    if (await direct.count()) {
      await direct.first().click();
      await pause(800);
      await qa.snap(page, 'chat-direct', { axe: false });
    }
  });

  // ---------- profile ----------
  const newPass = 'qaPass5678';
  await s('profile', async () => {
    await nav(page, '/profile');
    await qa.snap(page, 'profile');
    await page.getByLabel('Ім’я').fill('Марія');
    await page.getByLabel('Прізвище').fill('QA-Тестова');
    await page.getByRole('button', { name: 'Зберегти зміни' }).click();
    await page.getByText('Зміни збережено').first().waitFor();
    await page.locator('input[type="file"]').first().setInputFiles(f.cover);
    await page.getByText('Фото оновлено').first().waitFor();
    const theme = page.getByRole('group', { name: 'Тема оформлення' });
    await theme.getByRole('button', { name: 'Темна', exact: true }).click();
    await pause(500);
    await qa.snap(page, 'profile-dark');
    await theme.getByRole('button', { name: 'Світла', exact: true }).click();
    await page.getByLabel(/Дублювати сповіщення/).click();
    await page.getByText('Налаштування збережено').first().waitFor();
    await page.getByLabel(/Нагадувати за 24 години/).click();
    await page.getByLabel('Поточний пароль').fill('wrong-pass-1');
    await page.getByLabel('Новий пароль').fill(newPass);
    await page.getByLabel('Повторіть пароль').fill(newPass);
    await page.getByRole('button', { name: 'Змінити пароль' }).click();
    await pause(1200);
    await qa.snap(page, 'profile-wrong-current-pass', { axe: false });
    await page.getByLabel('Поточний пароль').fill(user.password);
    await page.getByRole('button', { name: 'Змінити пароль' }).click();
    await page.getByText('Пароль змінено').first().waitFor();
    await qa.snap(page, 'profile-saved');
  });

  await s('relogin-new-password', async () => {
    await logout(page, qa);
    await qa.login(page, user.email, newPass);
    await qa.snap(page, 'dashboard-after-learning');
  });

  await s('language-switch', async () => {
    const lang = page.getByRole('button', { name: /Українська|Мова/ }).first();
    await lang.click();
    await qa.snap(page, 'lang-menu', { axe: false, fullPage: false });
    await page.getByRole('menuitemradio', { name: /English/ }).or(page.getByRole('menuitem', { name: /English/ })).first().click();
    await pause(1500);
    await qa.snap(page, 'dashboard-en', { axe: false });
    await page.getByRole('button', { name: /English|Language/ }).first().click();
    await page.getByRole('menuitemradio', { name: /Українська/ }).or(page.getByRole('menuitem', { name: /Українська/ })).first().click();
    await pause(1500);
  });

  await s('delete-account', async () => {
    await nav(page, '/profile');
    await page.getByRole('button', { name: 'Видалити акаунт' }).click();
    const dlg = page.locator('dialog[open]');
    await qa.snap(page, 'delete-account-dialog', { fullPage: false });
    await dlg.getByLabel('Пароль').fill(newPass);
    await dlg.getByRole('button', { name: 'Видалити назавжди' }).click();
    await page.waitForURL(/\/welcome|\/login|\/$/, { timeout: 20_000 });
    await qa.snap(page, 'after-delete', { axe: false });
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: newPass }),
    });
    if (r.ok) qa.add('delete-account', 'bug', 'critical', 'deleted account can still log in via API');
    await qa.login(page, user.email, newPass).catch(() => undefined);
    await qa.snap(page, 'login-deleted-account', { axe: false });
  });

  // ---------- demo student ----------
  await ctx.clearCookies();
  await s('demo-dashboard', async () => {
    await qa.login(page, DEMO.student.email, DEMO.student.password);
    await qa.snap(page, 'demo-dashboard');
  });
  await s('demo-my-courses', async () => {
    await nav(page, '/my-courses');
    await qa.snap(page, 'demo-my-courses-active');
    await page.getByRole('tab', { name: /Завершені/ }).click();
    await page.waitForURL(/tab=completed/);
    await qa.snap(page, 'demo-my-courses-completed');
  });
  let certUrl = '';
  await s('demo-certificate', async () => {
    const card = page.locator('article', { hasText: 'Git і GitHub з нуля' });
    await card.getByRole('link', { name: 'Сертифікат' }).click();
    await page.waitForURL(/\/certificates\/LMS-/);
    certUrl = page.url();
    await qa.snap(page, 'certificate');
    await page.getByRole('button', { name: 'Поділитися посиланням' }).click();
    await page.getByText('Посилання скопійовано').first().waitFor();
    await page.emulateMedia({ media: 'print' });
    await qa.snap(page, 'certificate-print', { axe: false });
    await page.emulateMedia({ media: 'screen' });
  });
  await s('demo-grades', async () => {
    await nav(page, `/courses/${WEB}/grades`);
    await qa.snap(page, 'demo-grades');
    await nav(page, `/courses/${WEB}?test=131`);
    await qa.snap(page, 'demo-test-history', { axe: false });
  });
  await s('demo-access-control', async () => {
    for (const u of ['/admin', '/teacher/courses/new', `/courses/${WEB}/manage`, `/teacher/courses/${WEB}/builder`]) {
      await nav(page, u);
      await pause(800);
      if (new URL(page.url()).pathname === u) {
        qa.add('access', 'bug', 'critical', `student can open ${u}`, await qa.snap(page, `access${u.replace(/\W+/g, '-')}`, { axe: false }));
      }
    }
  });
  await s('certificate-public-guest', async () => {
    await ctx.clearCookies();
    await page.goto(certUrl);
    await qa.snap(page, 'certificate-public-guest');
    await page.goto(certUrl.replace(/LMS-\d{4}-\d{6}/, 'LMS-0000-000000'));
    await qa.snap(page, 'certificate-invalid', { axe: false });
  });

  // ---------- mobile / dark / en / pl in one extra context ----------
  await page.close();
  await ctx.close();
  const mctx = await qa.context({ mobile: true });
  const m = await qa.page(mctx, 'student-mobile');
  const ms = (name: string, fn: () => Promise<void>) => step(qa, m, name, fn);
  const mshot = async (name: string, url: string) => {
    await m.goto(`${BASE}${url}`);
    await qa.snap(m, name);
    const over = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 2) qa.add(name, 'overflow', 'major', `culprits: ${(await overflowCulprits(m)).join(' | ')}`);
  };
  await ms('m-login', async () => {
    await qa.login(m, DEMO.student.email, DEMO.student.password);
  });
  await ms('m-pages', async () => {
    await mshot('m-dashboard', '/');
    await mshot('m-course', `/courses/${WEB}?lesson=${FLEX}`);
    const toc = m.getByRole('button', { name: /Зміст/ }).first();
    if (await toc.count()) {
      await toc.click();
      await pause(600);
      await qa.snap(m, 'm-course-toc', { axe: false, fullPage: false });
      await m.keyboard.press('Escape');
    }
    await mshot('m-test-intro', `/courses/${WEB}?test=${JS_TEST}`);
    await mshot('m-my-courses', '/my-courses');
    await mshot('m-calendar', '/calendar');
    await mshot('m-chat', '/chat');
    await mshot('m-notifications', '/notifications');
    await mshot('m-profile', '/profile');
    await mshot('m-grades', `/courses/${WEB}/grades`);
  });
  await ms('dark-pages', async () => {
    await m.setViewportSize({ width: 1440, height: 780 });
    await m.evaluate(() => localStorage.setItem('theme', 'dark'));
    for (const [n, u] of [
      ['dark-dashboard', '/'],
      ['dark-course', `/courses/${WEB}?lesson=${FLEX}`],
      ['dark-my-courses', '/my-courses'],
      ['dark-calendar', '/calendar'],
      ['dark-chat', '/chat'],
      ['dark-grades', `/courses/${WEB}/grades`],
      ['dark-profile', '/profile'],
    ]) {
      await m.goto(`${BASE}${u}`);
      await qa.snap(m, n);
    }
    await m.evaluate(() => localStorage.setItem('theme', 'light'));
  });
  for (const loc of ['en', 'pl'] as const) {
    await ms(`${loc}-pages`, async () => {
      await mctx.addCookies([{ name: 'NEXT_LOCALE', value: loc, url: BASE }]);
      for (const [n, u] of [
        ['dashboard', '/'],
        ['course', `/courses/${WEB}?lesson=${FLEX}`],
        ['test', `/courses/${WEB}?test=${JS_TEST}`],
        ['my-courses', '/my-courses'],
        ['calendar', '/calendar'],
        ['notifications', '/notifications'],
        ['grades', `/courses/${WEB}/grades`],
        ['profile', '/profile'],
        ['purchases', '/purchases'],
      ]) {
        await m.goto(`${BASE}${u}`);
        await qa.snap(m, `${loc}-${n}`, { axe: false });
        const uk = await m.evaluate(() => {
          const t = document.querySelector('header')?.textContent ?? '';
          return /Головна|Мої курси|Календар/.test(t);
        });
        if (uk) qa.add(`${loc}-${n}`, 'i18n', 'major', `Ukrainian nav text in ${loc} header at ${u}`);
      }
    });
  }
  await mctx.clearCookies();
  await mctx.close();
  writeFileSync(path.join(qa.outDir, 'user.json'), JSON.stringify(user));
  await qa.finish();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
