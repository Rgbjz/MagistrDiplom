/**
 * Re-check of the fixes from docs/qa/QA-REPORT.md in ONE visible window and
 * ONE page: users switch by clearing cookies, the phone layout is the same
 * page resized to 390 px. Every screen also goes through overflow + axe.
 *   npx tsx qa/recheck.qa.ts
 */
import { BASE, DEMO, QA } from './harness';
import { api, apiToken, step } from './ta-common';

type Course = { id: number; title: string; price: number; published?: boolean; autoApprove?: boolean };

const DESKTOP = { width: 1440, height: 780 };
const PHONE = { width: 390, height: 760 };

async function main() {
  const qa = new QA('recheck', 'full');
  const notes: string[] = [];
  const ok = (cond: boolean, what: string) => {
    notes.push(`${cond ? 'OK  ' : 'FAIL'} ${what}`);
    if (!cond) qa.add('check', 'bug', 'major', what);
    console.log(`[recheck] ${cond ? 'OK' : 'FAIL'} ${what}`);
  };

  // ---------- fixtures through the API ----------
  const tTok = await apiToken(DEMO.teacher1.email, DEMO.teacher1.password);
  const fd = new FormData();
  fd.append('title', `QA Перевірка ${Date.now().toString(36)}`);
  fd.append('description', 'Курс для повторної перевірки виправлень QA.');
  fd.append('price', '0');
  fd.append('autoApprove', 'true');
  const draft = await api<Course>('/courses', tTok, { method: 'POST', body: fd });
  const section = await api<{ id: number }>(`/sections/${draft.id}`, tTok, {
    method: 'POST',
    body: JSON.stringify({ title: 'Розділ 1' }),
  });
  const lesson = await api<{ id: number }>(`/lessons/${section.id}`, tTok, {
    method: 'POST',
    body: JSON.stringify({ title: 'Тест-урок', content: '<p>Урок</p>' }),
  });
  const test = await api<{ id: number }>(`/tests/${lesson.id}`, tTok, {
    method: 'POST',
    body: JSON.stringify({ title: 'Контрольний тест', timeLimit: 10 }),
  });
  // A complete SINGLE question and an empty MULTIPLE one (the reported case).
  const good = await api<{ id: number }>(`/tests/${test.id}/questions`, tTok, {
    method: 'POST',
    body: JSON.stringify({ text: 'Скільки буде 2 + 2?', type: 'SINGLE' }),
  });
  for (const [text, isCorrect] of [
    ['4', true],
    ['5', false],
  ] as const) {
    await api(`/tests/questions/${good.id}/answers`, tTok, {
      method: 'POST',
      body: JSON.stringify({ text, isCorrect }),
    });
  }
  const bad = await api<{ id: number }>(`/tests/${test.id}/questions`, tTok, {
    method: 'POST',
    body: JSON.stringify({ text: 'Оберіть усі HTTP-методи', type: 'MULTIPLE' }),
  });
  await api(`/courses/${draft.id}/question-bank/import`, tTok, {
    method: 'POST',
    body: JSON.stringify({ text: '::Q1:: 2 + 2 = {=4 ~5}\n' }),
  });

  // An assistant (student account) on a demo course of teacher1, and a learner.
  const asst = await qa.freshUser('re-asst');
  const learner = await qa.freshUser('re-learner');
  const lTok = await apiToken(learner.email, learner.password);
  const all = await api<Course[]>('/courses', lTok);
  const mine = (await api<Course[]>('/courses', tTok)).filter((c) => c.published && c.id !== draft.id);
  const staffCourse = mine[0];
  await api(`/courses/${staffCourse.id}/staff`, tTok, {
    method: 'POST',
    body: JSON.stringify({ email: asst.email, role: 'ASSISTANT' }),
  });
  const free = all.find((c) => c.price === 0 && c.published !== false && c.autoApprove) ?? all.find((c) => c.price === 0)!;
  await api(`/courses/${free.id}/enroll`, lTok, { method: 'POST' }).catch(() => undefined);

  await qa.start();
  const ctx = await qa.context({ locale: 'uk' });
  const page = await qa.page(ctx, 'recheck');
  page.setDefaultTimeout(15_000);
  const go = (u: string) => page.goto(`${BASE}${u}`);
  const s = (n: string, fn: () => Promise<void>) => step(qa, page, n, fn);
  const as = async (u: { email: string; password: string }) => {
    await ctx.clearCookies();
    await page.setViewportSize(DESKTOP);
    await qa.login(page, u.email, u.password);
  };
  const landmarks = async () =>
    page.evaluate(() => ({
      main: document.querySelectorAll('main').length,
      footer: document.querySelectorAll('footer').length,
    }));
  const noOverflow = async (label: string) => {
    const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(o <= 2, `${label}: no horizontal overflow at ${page.viewportSize()?.width}px (${o}px)`);
  };
  const phoneSweep = async (who: string, urls: string[]) => {
    await page.setViewportSize(PHONE);
    for (const u of urls) {
      await s(`${who}-m${u}`, async () => {
        await go(u);
        await qa.snap(page, `${who}-m${u.replace(/[/?=&]+/g, '_')}`);
        await noOverflow(`${who} ${u}`);
      });
    }
    await page.setViewportSize(DESKTOP);
  };

  // ================= guest =================
  await s('guest-404', async () => {
    await go('/this-page-does-not-exist');
    await page.getByRole('heading', { name: /не знайдено/i }).first().waitFor();
    ok(new URL(page.url()).pathname === '/this-page-does-not-exist', 'minor 5: guest on unknown route stays on 404 (no /login redirect)');
    const l = await landmarks();
    ok(l.main === 1 && l.footer === 1, `minor 4: unknown route — one <main>/<footer> (${JSON.stringify(l)})`);
    await qa.snap(page, 'guest-404-unknown');
  });
  await s('guest-404-course', async () => {
    await go('/c/999999');
    await page.getByText('404').first().waitFor();
    const l = await landmarks();
    ok(l.main === 1 && l.footer === 1, `minor 4: /c/999999 — one <main>/<footer> (${JSON.stringify(l)})`);
    await qa.snap(page, 'guest-404-course');
  });
  await s('guest-404-cert', async () => {
    await go('/certificates/LMS-0000-000000');
    await page.waitForLoadState('networkidle');
    const l = await landmarks();
    ok(l.main === 1 && l.footer === 1, `minor 4: bad certificate — one <main>/<footer> (${JSON.stringify(l)})`);
    await qa.snap(page, 'guest-404-certificate');
  });
  await s('guest-protected', async () => {
    await go('/my-courses');
    ok(/\/login\?next=%2Fmy-courses/.test(page.url()), 'minor 5: protected route still redirects a guest to /login');
  });
  await phoneSweep('guest', ['/welcome', '/catalog', `/c/${free.id}`, '/login', '/register', '/this-page-does-not-exist']);

  // ================= learner (fresh, enrolled via API only) =================
  await as(learner);
  await s('learner-chat', async () => {
    await go('/chat');
    await page.getByText(free.title).first().waitFor();
    ok(true, 'minor 2: enrolled student sees the course chat in /chat without opening it first');
    await qa.snap(page, 'learner-chat-course-listed');
  });
  await s('learner-sessions', async () => {
    // Two more sign-ins in the same second (other devices).
    await Promise.all([apiToken(learner.email, learner.password), apiToken(learner.email, learner.password)]);
    await go('/profile');
    const btn = page.getByRole('button', { name: 'Завершити всі інші сесії' });
    await btn.scrollIntoViewIfNeeded();
    await qa.snap(page, 'learner-sessions-before');
    await btn.click();
    await page.getByText('Інші сесії завершено').first().waitFor();
    await page.waitForTimeout(800);
    await qa.snap(page, 'learner-sessions-after');
    ok((await btn.count()) === 0, 'minor 10 / M2: «Завершити всі інші сесії» leaves only the current session');
    await page.reload();
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    ok(!/\/login/.test(page.url()), 'M2: current session still works after ending the others');
  });
  await s('learner-checkout-404', async () => {
    await go('/checkout/999999');
    await page.getByText('404').first().waitFor();
    ok(await page.getByRole('link', { name: 'До каталогу' }).isVisible(), 'cosmetic 2: /checkout/999999 shows the styled 404 state');
    await qa.snap(page, 'learner-checkout-404');
  });
  await s('learner-modal', async () => {
    await go('/calendar');
    await page.getByRole('button', { name: 'Підписатися в Google Calendar' }).first().click();
    const box = await page.locator('dialog[open]').boundingBox();
    const vp = page.viewportSize()!;
    const centered = !!box && Math.abs(box.x + box.width / 2 - vp.width / 2) < 4 && box.y > 8;
    ok(centered, `M1: modal centered (${box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}` : 'no box'})`);
    await qa.snap(page, 'learner-modal-centered', { fullPage: false });
    await page.keyboard.press('Escape');
  });
  await phoneSweep('student', [
    '/',
    '/my-courses',
    '/chat',
    '/notifications',
    '/calendar',
    '/profile',
    `/courses/${free.id}`,
    '/purchases',
  ]);

  // Demo student in dark theme (contrast, M4).
  await as(DEMO.student);
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  for (const u of ['/', '/my-courses', '/calendar', '/chat']) {
    await s(`dark${u}`, async () => {
      await go(u);
      await qa.snap(page, `student-dark${u.replace(/\//g, '_') || '_home'}`);
    });
  }
  await page.setViewportSize(PHONE);
  await s('dark-m-course', async () => {
    await go('/my-courses');
    await qa.snap(page, 'student-dark-m-my-courses');
  });
  await page.evaluate(() => localStorage.setItem('theme', 'light'));
  await page.setViewportSize(DESKTOP);

  // ================= assistant =================
  await as(asst);
  await s('assistant-dashboard', async () => {
    await go('/');
    await page.waitForLoadState('networkidle');
    await qa.snap(page, 'assistant-dashboard');
    const sugg = page.locator('section', { has: page.getByRole('heading', { name: 'Може зацікавити' }) });
    const listed = (await sugg.count()) > 0 && (await sugg.getByText(staffCourse.title).count()) > 0;
    ok(!listed, `minor 8: assistant is not offered «${staffCourse.title}» in «Може зацікавити»`);
  });

  // ================= teacher =================
  await as(DEMO.teacher1);
  await s('teacher-builder-test', async () => {
    await go(`/teacher/courses/${draft.id}/builder`);
    await page.getByRole('button', { name: /Контрольний тест/ }).first().click();
    await page.getByText('Додайте щонайменше два варіанти відповіді.').first().waitFor();
    ok(await page.getByText('1 неповне питання').isVisible(), 'minor 3: test editor shows «1 неповне питання» badge');
    await qa.snap(page, 'teacher-builder-incomplete-question');
  });
  await s('teacher-publish-blocked', async () => {
    await page.getByRole('button', { name: 'Опублікувати' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'Курс не можна опублікувати' });
    await alert.waitFor();
    ok(await alert.getByText('питання 2').isVisible(), 'minor 3: publish is blocked and the problem (question 2) is listed');
    await qa.snap(page, 'teacher-publish-blocked');
    const c = await api<{ published: boolean }>(`/courses/${draft.id}`, tTok);
    ok(!c.published, 'minor 3: course stays a draft');
  });
  await s('teacher-fix-and-publish', async () => {
    // Complete the question in the UI, then publishing goes through.
    for (const [text, isCorrect] of [
      ['GET', true],
      ['FETCH', false],
    ] as const) {
      await api(`/tests/questions/${bad.id}/answers`, tTok, {
        method: 'POST',
        body: JSON.stringify({ text, isCorrect }),
      });
    }
    await page.reload();
    await page.getByRole('button', { name: /Контрольний тест/ }).first().click();
    await page.getByText('Скільки буде 2 + 2?').first().waitFor().catch(() => undefined);
    ok((await page.getByText('неповне питання').count()) === 0, 'minor 3: badge disappears once the question is complete');
    await page.getByRole('button', { name: 'Опублікувати' }).click();
    await page.getByText('Опубліковано').first().waitFor();
    await qa.snap(page, 'teacher-published-after-fix');
  });
  await s('teacher-lesson-video-label', async () => {
    await page.getByRole('button', { name: /Тест-урок/ }).first().click();
    await page.waitForTimeout(500);
    const unlabeled = await page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLInputElement>('input[type=file]')].filter(
          (i) => !i.getAttribute('aria-label') && !i.labels?.length && !i.getAttribute('aria-labelledby'),
        ).length,
    );
    ok(unlabeled === 0, `M5: every file input in the lesson editor has a label (${unlabeled} without)`);
    await qa.snap(page, 'teacher-lesson-editor');
  });
  await s('teacher-gift-export', async () => {
    await go(`/teacher/courses/${draft.id}/builder?tab=bank`);
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Експорт GIFT' }).click(),
    ]);
    const name = dl.suggestedFilename();
    ok(/^question-bank-[\w-]+-\d{4}-\d{2}-\d{2}\.gift$/.test(name), `cosmetic 3: GIFT export file name «${name}»`);
    await qa.snap(page, 'teacher-gift-exported');
  });
  await s('teacher-calendar-default', async () => {
    await go('/calendar');
    await page.getByRole('button', { name: 'Додати подію' }).click();
    const dialog = page.locator('dialog[open]');
    const select = dialog.getByLabel('Курс');
    const selected = await select.evaluate((el: HTMLSelectElement) => el.selectedOptions[0]?.textContent ?? '');
    const draftLabels = await select.locator('option', { hasText: '(чернетка)' }).count();
    ok(!selected.includes('(чернетка)'), `minor 7: «Нова подія» preselects a published course («${selected}»)`);
    ok(draftLabels > 0, `minor 7: drafts are marked «(чернетка)» (${draftLabels})`);
    await qa.snap(page, 'teacher-calendar-new-event', { fullPage: false });
    await page.keyboard.press('Escape');
    await go(`/calendar?course=${staffCourse.id}`);
    await page.getByRole('button', { name: 'Додати подію' }).click();
    const v = await page.locator('dialog[open]').getByLabel('Курс').inputValue();
    ok(v === String(staffCourse.id), 'minor 7: with a course filter the dialog preselects that course');
    await page.keyboard.press('Escape');
  });
  await s('teacher-wizard-step3', async () => {
    await go('/teacher/courses/new');
    await page.getByLabel('Назва курсу').fill('Курс-чернетка QA');
    await page.getByLabel('Опис курсу').fill('Перевірка структури підсумку майстра.');
    await page.getByLabel('Категорія').selectOption('Програмування');
    await page.getByLabel('Рівень').selectOption({ label: 'Початковий' });
    await page.getByRole('button', { name: 'Далі' }).click();
    await page.getByRole('radio', { name: 'Безкоштовний' }).check();
    await page.getByRole('button', { name: 'Далі' }).click();
    await page.locator('dl').first().waitFor();
    await qa.snap(page, 'teacher-wizard-step3'); // axe definition-list
  });
  await phoneSweep('teacher', [
    '/',
    `/teacher/courses/${draft.id}/builder`,
    `/courses/${staffCourse.id}/manage?tab=students`,
    `/courses/${staffCourse.id}/manage?tab=gradebook`,
    '/calendar',
    '/chat',
    '/teacher/courses/new',
  ]);

  // ================= learner takes the published test =================
  await as(learner);
  await s('learner-test-runner', async () => {
    await api(`/courses/${draft.id}/enroll`, lTok, { method: 'POST' });
    await go(`/courses/${draft.id}?test=${test.id}`);
    await page.getByRole('button', { name: /Почати тест|Пройти ще раз/ }).click();
    await page.getByText(/Питання 1/).first().waitFor();
    const mains = await page.evaluate(() => document.querySelectorAll('main').length);
    ok(mains === 1, `minor 9: TestRunner — one <main> (${mains})`);
    ok((await page.getByText(/з 2/).count()) > 0, 'minor 3: student gets both questions (none dropped silently)');
    await qa.snap(page, 'learner-test-runner');
  });

  // ================= admin =================
  await as(DEMO.admin);
  await s('admin-users-1440', async () => {
    await go('/admin');
    await page.getByRole('button', { name: /Заблокувати|Розблокувати/ }).first().waitFor();
    const fit = await page.evaluate(() => {
      const wrap = document.querySelector('[role=region][class*="tableWrap"]') as HTMLElement | null;
      return wrap ? { sw: wrap.scrollWidth, cw: wrap.clientWidth } : null;
    });
    ok(!!fit && fit.sw <= fit.cw + 1, `minor 6: users table fits its card at 1440 (${JSON.stringify(fit)})`);
    await qa.snap(page, 'admin-users-1440');
  });
  await phoneSweep('admin', ['/admin', '/chat', '/catalog']);

  // ---------- cleanup ----------
  await api(`/courses/${draft.id}`, tTok, { method: 'DELETE' }).catch((e) =>
    qa.add('cleanup', 'note', 'info', (e as Error).message),
  );
  console.log(`\n${notes.join('\n')}`);
  await qa.finish();
}

void main();
