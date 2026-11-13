import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { API, BASE, OUT, Phase, pause, saveState, state, uiLogin } from './h';

type Acc = { email: string; password: string; name: string };
const FIX = (n: string) => path.join(__dirname, '..', '..', 'e2e', 'fixtures', n);

(async () => {
  const ph = new Phase('student');
  const p = await ph.attach();
  const { S1, courseId, L1, L2 } = state<{ S1: Acc; courseId: number; L1: string; L2: string }>();
  const ORDER = ['<html>', '<body>', '<p>'];

  await uiLogin(ph, S1.email, S1.password, `/courses/${courseId}`);

  await ph.step('course-page-and-youtube', async () => {
    await p.getByRole('navigation', { name: 'Зміст курсу' }).waitFor();
    await pause(1500);
    await ph.snap('course-l1');
    const iframe = p.locator('iframe[src*="youtube.com/embed/ZY6uf5985PI"]');
    if (!(await iframe.count())) ph.add('lesson', 'bug', 'major', 'YouTube iframe missing on lesson 1');
    // Lesson HTML is sanitized: no <script>, external link opens in a new tab.
    const html = await p.locator('main').innerHTML();
    if (/<script/i.test(html.replace(/<script[^>]*src=[^>]*>/g, ''))) ph.add('lesson', 'security', 'critical', 'script tag rendered in lesson content');
    const ext = p.locator('main a[href="https://developer.mozilla.org"]');
    if ((await ext.getAttribute('target')) !== '_blank') ph.add('lesson', 'bug', 'minor', 'external link in lesson not opened in new tab');
    const previews = await p.getByRole('navigation', { name: 'Зміст курсу' }).locator('img').count();
    if (!previews) ph.add('course', 'bug', 'minor', 'no lesson previews in the course contents');
  });

  await ph.step('lesson-file-download', async () => {
    const link = p.getByRole('link', { name: 'teacher-Конспект уроку.md' }).first();
    const res = await p.request.get((await link.getAttribute('href'))!);
    if (res.status() !== 200) ph.add('files', 'bug', 'major', `lesson file download → ${res.status()}`);
    const html = p.getByRole('link', { name: 'teacher-evil.html' }).first();
    const h = (await p.request.get((await html.getAttribute('href'))!)).headers();
    if (h['content-security-policy'] !== 'sandbox' || !/^attachment/.test(h['content-disposition'] ?? '')) {
      ph.add('files', 'security', 'major', `student HTML download headers: ${h['content-type']} / ${h['content-disposition']}`);
    }
  });

  await ph.step('mark-lesson-complete', async () => {
    await p.getByRole('button', { name: /Завершити і далі|Завершити урок/ }).first().click();
    await pause(2000);
    await ph.snap('after-complete', { full: false });
  });

  await ph.step('take-test-all-types', async () => {
    await p.goto(`${BASE}/courses/${courseId}?lesson=${'' /* test via contents */}`);
    await p.getByRole('navigation', { name: 'Зміст курсу' }).getByRole('button', { name: /^Тест/ }).first().click();
    await p.getByRole('button', { name: 'Почати тест' }).click();
    await p.getByRole('timer').waitFor();
    await ph.snap('test-q1', { full: false });
    for (let i = 0; i < 12; i++) {
      await pause(600);
      const num = p.getByLabel('Ваша відповідь (число)');
      const text = p.getByLabel('Ваша відповідь', { exact: true });
      const order = p.getByRole('list', { name: 'Елементи для впорядкування' });
      const match = p.getByLabel('<ul>', { exact: true });
      const tf = p.getByRole('radio', { name: 'Правда' });
      const multi = p.getByRole('checkbox', { name: '<h1>' });
      const single = p.getByRole('radio', { name: '<a>' });
      if (await num.count()) await num.fill('6');
      else if (await order.count()) {
        for (const [target, item] of ORDER.entries()) {
          const texts = await order.locator('li').allInnerTexts();
          let at = texts.findIndex((x) => x.includes(item));
          while (at > target) {
            await p.getByRole('button', { name: `Перемістити «${item}» вгору` }).click();
            at--;
          }
        }
      } else if (await match.count()) {
        await match.selectOption({ label: 'маркований список' });
        await p.getByLabel('<ol>', { exact: true }).selectOption({ label: 'нумерований список' });
      } else if (await text.count()) {
        const q = await p.locator('main').innerText();
        await text.fill(/alt/.test(q) ? 'Атрибут alt описує зображення для екранних читачів і пошукових систем.' : 'href');
      } else if (await tf.count()) await tf.check();
      else if (await multi.count()) {
        await multi.check();
        await p.getByRole('checkbox', { name: '<h2>' }).check();
      } else if (await single.count()) await single.check();
      const next = p.getByRole('button', { name: /^Наступне/ });
      if (await next.isEnabled().catch(() => false)) await next.click();
      else break;
    }
    await ph.snap('test-last', { full: false });
    await p.getByRole('button', { name: 'Завершити тест' }).last().click();
    const dlg = p.getByRole('dialog');
    if (await dlg.count()) await dlg.getByRole('button', { name: /Завершити/ }).click().catch(() => undefined);
    await p.waitForURL(/\/result/, { timeout: 30_000 });
    await pause(1500);
    await ph.snap('test-result');
  });

  await ph.step('hls-video-lesson', async () => {
    await p.goto(`${BASE}/courses/${courseId}`);
    await p.getByRole('navigation', { name: 'Зміст курсу' }).getByRole('button', { name: L2, exact: true }).click();
    const v = p.getByLabel(`Відео уроку «${L2}»`);
    await v.waitFor({ timeout: 30_000 });
    await p.locator('video').first().evaluate((el: HTMLVideoElement) => {
      el.muted = true;
      return el.play();
    });
    await pause(4000);
    const t = await p.locator('video').first().evaluate((el: HTMLVideoElement) => el.currentTime);
    if (t <= 0) ph.add('video', 'bug', 'major', 'uploaded (Cloudinary HLS) video does not play');
    const quality = p.getByLabel('Якість');
    if (await quality.count()) await ph.snap('video-playing', { full: false });
    else await ph.snap('video-playing-no-quality', { full: false });
  });

  await ph.step('assignment-submit-html', async () => {
    const html = path.join(OUT, 'index.html');
    writeFileSync(html, '<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><title>ЛР</title></head><body><h1>Моя сторінка</h1><script>alert(1)</script></body></html>');
    await p.getByRole('navigation', { name: 'Зміст курсу' }).getByRole('button', { name: /^Завдання: / }).first().click();
    await p.getByRole('heading', { level: 1, name: /QA лабораторна/ }).waitFor();
    await ph.snap('assignment');
    await p.getByLabel('Файли роботи').setInputFiles([html, FIX('student-avatar.png')]);
    await p.getByLabel('Коментар до роботи').fill('Перша версія роботи.');
    await p.getByRole('button', { name: 'Здати роботу' }).click();
    await p.getByText('Роботу здано').first().waitFor({ timeout: 30_000 });
    await ph.snap('assignment-submitted');
  });

  await ph.step('grades-calendar-notifications', async () => {
    await p.goto(`${BASE}/courses/${courseId}/grades`);
    await ph.snap('my-grades');
    await p.goto(`${BASE}/calendar`);
    await ph.snap('calendar');
    const sub = p.getByRole('button', { name: 'Підписатися в Google Calendar' });
    if (await sub.count()) {
      await sub.click();
      const url = await p.getByTestId('ical-url').inputValue();
      const ics = await p.request.get(url);
      const body = await ics.text();
      if (ics.status() !== 200 || !/BEGIN:VCALENDAR/.test(body)) ph.add('calendar', 'bug', 'major', `iCal feed → ${ics.status()}`);
      if (!/QA лабораторна/.test(body)) ph.add('calendar', 'bug', 'minor', 'iCal feed has no assignment deadline');
      await ph.snap('calendar-ical', { full: false, axe: false });
      await p.keyboard.press('Escape');
    }
    await p.goto(`${BASE}/notifications`);
    await ph.snap('notifications');
    await p.goto(`${BASE}/my-courses`);
    await ph.snap('my-courses');
    await p.goto(`${BASE}/my-courses?tab=completed`);
    await ph.snap('my-courses-completed', { axe: false });
    await p.goto(`${BASE}/purchases`);
    await ph.snap('purchases');
  });

  await ph.step('free-course-enroll-and-paid-checkout-view', async () => {
    await p.goto(`${BASE}/catalog?search=${encodeURIComponent('HTML з нуля')}`);
    await p.getByRole('link', { name: /HTML з нуля/ }).first().click();
    await p.waitForURL(/\/c\/\d+/);
    await p.getByRole('button', { name: /Записатися/ }).first().click();
    await pause(2500);
    await ph.snap('html-course-enrolled', { full: false });
    // Paid course: open the checkout page only (no payment details on production).
    await p.goto(`${BASE}/catalog?search=${encodeURIComponent('TypeScript')}`);
    await p.getByRole('link', { name: /TypeScript для початківців/ }).first().click();
    await p.waitForURL(/\/c\/\d+/);
    const buy = p.getByRole('link', { name: /Купити|Придбати|Оплатити/ }).or(p.getByRole('button', { name: /Купити|Придбати|Оплатити/ })).first();
    if (await buy.count()) {
      await buy.click();
      await pause(2000);
      await ph.snap('checkout-view');
    }
  });

  await ph.step('profile-avatar-theme-language', async () => {
    await p.goto(`${BASE}/profile`);
    await p.getByRole('heading', { level: 1, name: 'Профіль і налаштування' }).waitFor();
    await p.locator('input[type="file"]').first().setInputFiles(FIX('student-avatar.png'));
    await pause(3000);
    await ph.snap('profile-avatar');
    const theme = p.getByRole('group', { name: 'Тема оформлення' });
    await theme.getByRole('button', { name: 'Темна', exact: true }).click();
    await pause(600);
    await ph.snap('profile-dark');
    await p.goto(`${BASE}/courses/${courseId}`);
    await pause(1500);
    await ph.snap('course-dark');
    await p.goto(`${BASE}/profile`);
    await p.getByRole('group', { name: 'Тема оформлення' }).getByRole('button', { name: 'Світла', exact: true }).click();
    // Language segmented control in the profile.
    await p.getByRole('radio', { name: 'English' }).first().click().catch(() => p.getByRole('button', { name: 'English' }).first().click());
    await pause(1500);
    await ph.snap('profile-en', { axe: false });
    await p.getByRole('radio', { name: 'Українська' }).first().click().catch(() => p.getByRole('button', { name: 'Українська' }).first().click());
    await pause(1500);
  });

  await ph.step('password-change', async () => {
    await p.goto(`${BASE}/profile`);
    await p.getByLabel('Поточний пароль').fill(S1.password);
    await p.getByLabel('Новий пароль').fill('qaPass9876');
    await p.getByLabel('Повторіть пароль').fill('qaPass9876');
    await p.getByRole('button', { name: 'Змінити пароль' }).click();
    await pause(2000);
    await ph.snap('password-changed', { full: false, axe: false });
    saveState({ S1: { ...S1, password: 'qaPass9876' } });
  });

  console.log(API);
  await ph.done();
})();
