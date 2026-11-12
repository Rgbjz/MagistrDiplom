/**
 * Areas 4+5 in ONE window / ONE page: requests, student takes the QA test and
 * hands in work, teacher grades (essay + assignment), gradebook overrides and
 * exports, calendar event + reminder, team roles (teacher2, assistant).
 * Users are switched by logout (cookie clear) + login in the same page.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ExcelJS from '../../backend/node_modules/exceljs';
import type { Page } from '@playwright/test';
import { API, BASE, DEMO, QA } from './harness';
import { api, apiToken, fixtures, loadState, step } from './ta-common';
import { pause } from './util';

async function main() {
  const f = fixtures();
  const st = loadState();
  const COURSE: number = st.courseId;
  const TITLE: string = st.courseTitle;
  const qa = new QA('manage', 'full');
  const s1 = await qa.freshUser('learner');
  const s2 = await qa.freshUser('rejectme');
  const asst = await qa.freshUser('assistant');
  const name1 = 'QA learner';
  const name2 = 'QA rejectme';
  const nameA = 'QA assistant';
  // second requester goes through the API
  await api(`/courses/${COURSE}/enroll`, await apiToken(s2.email, s2.password), { method: 'POST' }).catch((e) =>
    qa.add('setup', 'note', 'info', `s2 request: ${(e as Error).message}`),
  );

  await qa.start();
  const ctx = await qa.context();
  const page = await qa.page(ctx, 'manage');
  page.setDefaultTimeout(15_000);
  const s = (n: string, fn: () => Promise<void>) => step(qa, page, n, fn);
  const go = (u: string) => page.goto(`${BASE}${u}`);
  const as = async (u: { email: string; password: string }) => {
    await ctx.clearCookies();
    await qa.login(page, u.email, u.password);
  };
  const manage = (tab: string) => go(`/courses/${COURSE}/manage?tab=${tab}`);

  // ---------- student requests access ----------
  await s('student-request', async () => {
    await as(s1);
    await go(`/c/${COURSE}`);
    await qa.snap(page, 'qa-landing-student');
    await page.getByRole('button', { name: 'Подати заявку' }).click();
    await page.getByText('Заявку надіслано викладачу').first().waitFor();
  });

  // ---------- teacher approves / rejects ----------
  await s('teacher-requests', async () => {
    await as(DEMO.teacher1);
    await qa.snap(page, 'teacher-dashboard-requests');
    await manage('requests');
    await qa.snap(page, 'manage-requests');
    await page.getByRole('button', { name: `Схвалити заявку ${name1}` }).click();
    await page.getByText(`${name1}: заявку схвалено`).first().waitFor();
    await page.getByRole('button', { name: `Відхилити заявку ${name2}` }).click();
    const dlg = page.locator('dialog[open]');
    if (await dlg.isVisible().catch(() => false)) {
      await qa.snap(page, 'reject-confirm', { fullPage: false, axe: false });
      await dlg.getByRole('button', { name: /Відхилити/ }).click();
    }
    await page.getByText(`${name2}: заявку відхилено`).first().waitFor();
    await qa.snap(page, 'manage-requests-done');
  });

  // ---------- student learns, takes test, hands in work ----------
  await s('student-test', async () => {
    await as(s1);
    await go(`/courses/${COURSE}`);
    await page.getByRole('navigation', { name: 'Зміст курсу' }).waitFor();
    await qa.snap(page, 'qa-lesson-student');
    const scripts = await page.locator('article script').count();
    if (scripts) qa.add('lesson-html', 'bug', 'critical', `lesson HTML renders ${scripts} <script> tag(s)`);
    await page.getByRole('navigation', { name: 'Зміст курсу' }).getByRole('button', { name: /^Тест/ }).first().click();
    await page.getByRole('button', { name: 'Почати тест' }).click();
    await page.getByRole('timer').waitFor();
    const counter = page.getByText(/^Питання \d+ з \d+$/);
    const total = Number((await counter.textContent())!.match(/з (\d+)/)![1]);
    const next = page.getByRole('button', { name: /^Наступне/ });
    for (let i = 0; i < total; i++) {
      await page.getByText(`Питання ${i + 1} з ${total}`).waitFor();
      const body = await page.locator('main').innerText();
      if (/Скільки колонок/.test(body)) {
        await page.getByLabel('Ваша відповідь (число)').fill('12');
      } else if (/Зіставте властивість/.test(body)) {
        await page.getByLabel('gap', { exact: true }).selectOption({ label: 'відступ' });
        await page.getByLabel('order', { exact: true }).selectOption({ label: 'порядок' });
      } else if (/Порядок каскаду/.test(body)) {
        const order = ['Браузер', 'Автор', 'Important'];
        const list = page.getByRole('list', { name: 'Елементи для впорядкування' });
        for (const [target, item] of order.entries()) {
          let at = (await list.locator('li').allInnerTexts()).findIndex((x) => x.includes(item));
          while (at > target) {
            await page.getByRole('button', { name: `Перемістити «${item}» вгору` }).click();
            at--;
          }
        }
        await qa.snap(page, 'test-ordering', { fullPage: false, axe: false });
      } else if (/Поясніть різницю/.test(body)) {
        await page.getByLabel('Ваша відповідь', { exact: true }).fill('Flex працює в одній осі, Grid — у двох; grid для макета сторінки.');
        await qa.snap(page, 'test-essay', { fullPage: false, axe: false });
      } else if (/головна вісь/.test(body)) {
        await page.getByLabel('Ваша відповідь', { exact: true }).fill('Main Axis');
      } else if (/Grid працює у двох/.test(body)) {
        await page.locator('fieldset button[aria-pressed]').filter({ hasText: /Правда/ }).first().click();
      } else if (/вмикає flex/.test(body)) {
        await page.locator('fieldset button[aria-pressed]').filter({ hasText: 'display: flex' }).first().click();
      } else if (/належить до Grid/.test(body)) {
        const opts = await page.locator('fieldset button[aria-pressed]').count();
        await qa.snap(page, 'test-empty-multiple', { fullPage: false, axe: false });
        if (!opts) qa.add('test-empty-multiple', 'bug', 'major', 'published test shows a MULTIPLE question with no options — student cannot answer it');
      }
      if (i < total - 1) await next.click();
    }
    await page.getByRole('button', { name: 'Завершити тест' }).last().click();
    const dlg = page.locator('dialog[open]');
    await pause(600);
    if (await dlg.isVisible().catch(() => false)) {
      await qa.snap(page, 'test-unanswered-confirm', { fullPage: false, axe: false });
      await dlg.getByRole('button', { name: 'Завершити' }).click();
    }
    await page.waitForURL(/\/result$/);
    await qa.snap(page, 'qa-test-result-pending');
  });

  await s('student-assignment', async () => {
    await go(`/courses/${COURSE}`);
    await page.getByRole('navigation', { name: 'Зміст курсу' }).getByRole('button', { name: /^Завдання/ }).first().click();
    await page.getByLabel('Файли роботи').setInputFiles([f.notes, f.pdf]);
    await page.getByRole('button', { name: 'Здати роботу' }).click();
    await page.getByText('Роботу здано').first().waitFor();
    await qa.snap(page, 'qa-assignment-submitted', { axe: false });
  });

  // ---------- teacher: results, essay, assignment ----------
  await s('teacher-essay', async () => {
    await as(DEMO.teacher1);
    await manage('tests');
    await qa.snap(page, 'manage-tests');
    const reviews = page.getByRole('region', { name: /Потребує перевірки/ });
    await reviews.getByRole('button', { name: /^Оцінити відповідь/ }).first().click();
    const dialog = page.locator('dialog[open]');
    await qa.snap(page, 'essay-dialog', { fullPage: false });
    await dialog.getByLabel(/^Бали/).fill('5');
    const disabled = await dialog.getByRole('button', { name: 'Зберегти оцінку' }).isDisabled();
    if (!disabled) qa.add('essay-dialog', 'bug', 'major', 'essay score above max is accepted');
    await dialog.getByLabel(/^Бали/).fill('1');
    await dialog.getByLabel('Коментар для студента').fill('Добре, але бракує прикладів.');
    await dialog.getByRole('button', { name: 'Зберегти оцінку' }).click();
    await page.getByText('Оцінку збережено').first().waitFor();
    await page.getByRole('button', { name: 'Результати' }).first().click();
    await pause(800);
    await qa.snap(page, 'test-results-dialog', { fullPage: false });
    await page.keyboard.press('Escape');
  });

  await s('teacher-assignment', async () => {
    await manage('assignments');
    await qa.snap(page, 'manage-assignments');
    const row = page.getByRole('row', { name: new RegExp(name1) }).first();
    await row.getByRole('button', { name: 'Перевірити' }).click();
    const dialog = page.getByRole('dialog', { name: `Робота: ${name1}` });
    await dialog.getByLabel(/Оцінка/).fill('70');
    await qa.snap(page, 'assignment-grade-invalid', { fullPage: false, axe: false });
    await dialog.getByLabel(/Оцінка/).fill('42');
    await dialog.getByLabel('Коментар для студента').fill('Сітка гарна, додайте gap.');
    await dialog.getByRole('button', { name: 'Оцінити' }).click();
    await page.getByText('Оцінку збережено').first().waitFor();
    await qa.snap(page, 'manage-assignments-graded');
  });

  await s('students-tab', async () => {
    await manage('students');
    await qa.snap(page, 'manage-students');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Експорт CSV' }).click()]);
    const p = path.join(qa.outDir, `students-${dl.suggestedFilename()}`);
    await dl.saveAs(p);
    qa.add('students-csv', 'note', 'info', `${dl.suggestedFilename()}: ${readFileSync(p, 'utf8').split('\n').slice(0, 2).join(' | ').slice(0, 300)}`);
  });

  // ---------- gradebook ----------
  const gbRow = (n: string) => page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: new RegExp(n) }) });
  await s('gradebook-override', async () => {
    await manage('gradebook');
    await page.getByRole('heading', { name: 'Журнал оцінок' }).waitFor();
    await qa.snap(page, 'gradebook');
    const row = gbRow(name1);
    await row.getByRole('button', { name: `Змінити оцінку: ${name1}, QA Завдання: сітка каталогу` }).click();
    const dialog = page.getByRole('dialog', { name: 'Змінити оцінку' });
    await dialog.getByLabel('Нова оцінка').fill('48');
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await dialog.getByText(/Вкажіть причину/).waitFor();
    await qa.snap(page, 'override-validation', { fullPage: false, axe: false });
    await dialog.getByLabel('Причина зміни').fill('Перездача на консультації');
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await page.getByText('Оцінку змінено', { exact: true }).first().waitFor();
    await row.getByRole('button', { name: `Змінити оцінку: ${name1}, Підсумкова оцінка` }).click();
    await dialog.getByLabel('Нова оцінка').fill('91');
    await dialog.getByLabel('Причина зміни').fill('Активна участь у семінарах');
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await page.getByText('Оцінку змінено', { exact: true }).first().waitFor();
    await pause(600);
    await qa.snap(page, 'gradebook-overridden');
    await row.getByRole('button', { name: `Змінити оцінку: ${name1}, Підсумкова оцінка` }).click();
    await pause(500);
    await qa.snap(page, 'override-history', { fullPage: false });
    await page.keyboard.press('Escape');
    await page.getByLabel('Лише ті, хто не склав').check();
    await qa.snap(page, 'gradebook-filter-failed', { axe: false });
    await page.getByLabel('Лише ті, хто не склав').uncheck();
  });

  const exportsDir = qa.outDir;
  const checkXlsx = async (file: string, lang: string) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    const head = (ws.getRow(1).values as unknown[]).filter(Boolean).map(String);
    qa.add(`export-xlsx-${lang}`, 'note', 'info', `sheets=${wb.worksheets.map((w) => w.name).join(',')} header=${head.join(' | ').slice(0, 300)}`);
    const row2 = (ws.getRow(2).values as unknown[]).filter((v) => v !== undefined).map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v)));
    qa.add(`export-xlsx-${lang}`, 'note', 'info', `row2=${row2.join(' | ').slice(0, 300)}`);
  };
  for (const lang of ['uk', 'en', 'pl'] as const) {
    await s(`gradebook-export-${lang}`, async () => {
      if (lang !== 'uk') {
        await page.locator('header select').first().selectOption(lang);
        await pause(1500);
      }
      await manage('gradebook');
      await page.getByRole('heading', { level: 2 }).first().waitFor();
      if (lang !== 'uk') await qa.snap(page, `gradebook-${lang}`, { axe: false });
      const buttons = page.getByRole('main').getByRole('button').filter({ hasText: /CSV/ });
      const [csv] = await Promise.all([page.waitForEvent('download'), buttons.first().click()]);
      const csvPath = path.join(exportsDir, `gb-${lang}-${csv.suggestedFilename()}`);
      await csv.saveAs(csvPath);
      const text = readFileSync(csvPath, 'utf8');
      qa.add(`export-csv-${lang}`, 'note', 'info', `${csv.suggestedFilename()} :: ${text.split('\r\n').slice(0, 3).join(' ¶ ').slice(0, 400)}`);
      if (!text.startsWith('﻿')) qa.add(`export-csv-${lang}`, 'bug', 'minor', 'CSV has no UTF-8 BOM');
      if (lang !== 'uk' && /Студент|Підсумок|зараховано/.test(text.split('\r\n')[0]) && lang === 'en') qa.add(`export-csv-${lang}`, 'bug', 'major', 'EN CSV header still Ukrainian');
      const xbtn = page.getByRole('main').getByRole('button').filter({ hasText: /Excel/ });
      const [x] = await Promise.all([page.waitForEvent('download'), xbtn.first().click()]);
      const xPath = path.join(exportsDir, `gb-${lang}-${x.suggestedFilename()}`);
      await x.saveAs(xPath);
      await checkXlsx(xPath, lang);
    });
  }
  await s('back-to-uk', async () => {
    await page.locator('header select').first().selectOption('uk');
    await pause(1500);
  });

  await s('gradebook-reset', async () => {
    await manage('gradebook');
    await gbRow(name1).getByRole('button', { name: `Змінити оцінку: ${name1}, Підсумкова оцінка` }).click();
    await page.getByRole('dialog', { name: 'Змінити оцінку' }).getByRole('button', { name: 'Скинути до автоматичної' }).click();
    await page.getByText('Оцінку повернуто до автоматичної').first().waitFor();
    await qa.snap(page, 'gradebook-reset', { axe: false });
  });

  // ---------- calendar event + reminder ----------
  const eventDay = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  await s('calendar-event', async () => {
    await go('/calendar');
    await page.getByRole('button', { name: 'Додати подію' }).click();
    const dialog = page.locator('dialog[open]');
    await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
    await pause(500);
    await qa.snap(page, 'event-validation', { fullPage: false, axe: false });
    await dialog.getByLabel('Курс').selectOption({ label: TITLE });
    await dialog.getByLabel('Назва').fill('QA Онлайн-заняття: Grid');
    await dialog.getByRole('combobox', { name: 'Тип', exact: true }).selectOption({ label: 'Онлайн-заняття' });
    await dialog.getByLabel('Початок').fill(`${eventDay}T10:00`);
    await dialog.getByLabel('Кінець (необов’язково)').fill(`${eventDay}T09:00`);
    await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
    await pause(500);
    await qa.snap(page, 'event-end-before-start', { fullPage: false, axe: false });
    await dialog.getByLabel('Кінець (необов’язково)').fill(`${eventDay}T11:30`);
    await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
    await page.getByText('Подію додано').first().waitFor();
    await go(`/calendar?view=agenda&course=${COURSE}`);
    await qa.snap(page, 'teacher-calendar-agenda');
    const t = await apiToken(DEMO.teacher1.email, DEMO.teacher1.password);
    const course = await api<{ sections: { lessons: { assignment?: { id: number } | null; assignments?: { id: number }[] }[] }[] }>(`/courses/${COURSE}`, t);
    const l = course.sections.flatMap((x) => x.lessons)[0] as any;
    const asgId = l.assignment?.id ?? l.assignments?.[0]?.id;
    if (asgId) {
      const r = await api<{ notified: number }>('/calendar/dev/remind', t, { method: 'POST', body: JSON.stringify({ kind: 'assignment', id: asgId }) });
      qa.add('reminder', 'note', 'info', `dev remind assignment ${asgId}: notified=${r.notified}`);
    } else qa.add('reminder', 'note', 'info', 'assignment id not found in course payload');
  });

  // ---------- team ----------
  await s('team-add', async () => {
    await manage('team');
    await qa.snap(page, 'team');
    const invite = page.getByRole('heading', { name: 'Додати до команди' }).locator('xpath=ancestor::form');
    await invite.getByLabel('Email').fill(DEMO.teacher2.email);
    await invite.getByLabel('Роль').selectOption('TEACHER');
    await invite.getByRole('button', { name: 'Додати' }).click();
    await page.getByText('Учасника додано до команди').first().waitFor();
    await invite.getByLabel('Email').fill(asst.email);
    await invite.getByLabel('Роль').selectOption('TEACHER');
    await invite.getByRole('button', { name: 'Додати' }).click();
    await page.getByText('Викладачем курсу може бути лише обліковий запис викладача').first().waitFor();
    await qa.snap(page, 'team-student-as-teacher-error', { axe: false });
    await invite.getByLabel('Роль').selectOption('ASSISTANT');
    await invite.getByRole('button', { name: 'Додати' }).click();
    await page.getByRole('row', { name: new RegExp(asst.email) }).waitFor();
    await invite.getByLabel('Email').fill('nobody-here@qa.local');
    await invite.getByRole('button', { name: 'Додати' }).click();
    await pause(1200);
    await qa.snap(page, 'team-full');
  });

  await s('teacher2-permissions', async () => {
    await as(DEMO.teacher2);
    await qa.snap(page, 'teacher2-dashboard');
    await go(`/teacher/courses/${COURSE}/builder`);
    await page.getByRole('complementary', { name: 'Структура курсу' }).waitFor();
    const del = await page.getByRole('button', { name: 'Видалити курс' }).count();
    if (del) qa.add('teacher2-builder', 'bug', 'major', 'co-teacher sees «Видалити курс»');
    await qa.snap(page, 'teacher2-builder', { axe: false });
    await page.getByRole('tab', { name: 'Налаштування і ціна' }).click();
    await qa.snap(page, 'teacher2-settings', { axe: false });
    await manage('team');
    await qa.snap(page, 'teacher2-team-readonly', { axe: false });
    const r = await fetch(`${API}/courses/${COURSE}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await apiToken(DEMO.teacher2.email, DEMO.teacher2.password)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: 999 }),
    });
    if (r.status !== 403) qa.add('teacher2-price', 'bug', 'critical', `co-teacher PATCH price → ${r.status}`);
  });

  await s('assistant-permissions', async () => {
    await as(asst);
    await qa.snap(page, 'assistant-dashboard');
    await manage('assignments');
    await qa.snap(page, 'assistant-manage-assignments');
    await manage('gradebook');
    await qa.snap(page, 'assistant-gradebook', { axe: false });
    await go(`/teacher/courses/${COURSE}/builder`);
    await pause(1000);
    if (/builder/.test(page.url())) qa.add('assistant-builder', 'bug', 'major', 'assistant can open builder', await qa.snap(page, 'assistant-builder', { axe: false }));
  });

  await s('team-remove', async () => {
    await as(DEMO.teacher1);
    await manage('team');
    await page.getByRole('row', { name: new RegExp(asst.email) }).getByRole('button', { name: /^Видалити .* з команди$/ }).click();
    await qa.snap(page, 'team-remove-confirm', { fullPage: false, axe: false });
    await page.getByRole('dialog', { name: 'Видалити з команди?' }).getByRole('button', { name: 'Видалити' }).click();
    await page.getByText('Учасника видалено з команди').first().waitFor();
    // teacher2 stays? remove too so the course is clean
    await page.getByRole('row', { name: /teacher2|Андрій/ }).getByRole('button', { name: /^Видалити .* з команди$/ }).click().catch(() => undefined);
    const d = page.getByRole('dialog', { name: 'Видалити з команди?' });
    if (await d.isVisible().catch(() => false)) await d.getByRole('button', { name: 'Видалити' }).click();
    await pause(800);
    await qa.snap(page, 'team-after-remove', { axe: false });
    const r = await fetch(`${API}/courses/${COURSE}/students/progress`, { headers: { Authorization: `Bearer ${await apiToken(asst.email, asst.password)}` } });
    if (r.status !== 403) qa.add('assistant-removed', 'bug', 'critical', `removed assistant still gets ${r.status} on students/progress`);
  });

  // ---------- student sees everything ----------
  await s('student-sees-grades', async () => {
    await as(s1);
    await go(`/courses/${COURSE}/grades`);
    await qa.snap(page, 'student-grades-final');
    await page.getByText(/Перевірено|42/).first().waitFor().catch(() => undefined);
    await go('/notifications');
    await qa.snap(page, 'student-notifications');
    await go(`/calendar?view=agenda`);
    await qa.snap(page, 'student-calendar-event');
    await go('/');
    await qa.snap(page, 'student-dashboard-final');
  });
  await s('rejected-student', async () => {
    await as(s2);
    await go('/my-courses?tab=pending');
    await qa.snap(page, 'rejected-my-courses', { axe: false });
    await go(`/c/${COURSE}`);
    await qa.snap(page, 'rejected-landing', { axe: false });
  });

  // ---------- dark / mobile manage pass ----------
  await page.close();
  await ctx.close();
  const mctx = await qa.context({ mobile: true });
  const m = await qa.page(mctx, 'manage-mobile');
  await step(qa, m, 'mobile-manage', async () => {
    await qa.login(m, DEMO.teacher1.email, DEMO.teacher1.password);
    for (const t of ['requests', 'students', 'tests', 'assignments', 'gradebook', 'team']) {
      await m.goto(`${BASE}/courses/${COURSE}/manage?tab=${t}`);
      await qa.snap(m, `m-manage-${t}`);
    }
    await m.goto(`${BASE}/teacher/courses/${COURSE}/builder`);
    await qa.snap(m, 'm-builder');
    await m.goto(`${BASE}/`);
    await qa.snap(m, 'm-teacher-dashboard');
    await m.setViewportSize({ width: 1440, height: 780 });
    await m.evaluate(() => localStorage.setItem('theme', 'dark'));
    for (const [n, u] of [
      ['dark-teacher-dashboard', '/'],
      ['dark-builder', `/teacher/courses/${COURSE}/builder`],
      ['dark-gradebook', `/courses/${COURSE}/manage?tab=gradebook`],
      ['dark-assignments', `/courses/${COURSE}/manage?tab=assignments`],
      ['dark-wizard', '/teacher/courses/new'],
    ]) {
      await m.goto(`${BASE}${u}`);
      await qa.snap(m, n);
    }
    await m.evaluate(() => localStorage.setItem('theme', 'light'));
  });
  await mctx.close();
  await qa.finish();
}

async function _unused(_p: Page) {}
void _unused;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
