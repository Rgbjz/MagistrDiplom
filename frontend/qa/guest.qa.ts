import { QA, BASE, API } from './harness';
import { step, courseId, pause, overflowCulprits } from './util';

(async () => {
  const qa = new QA('guest', 'full');
  await qa.start();
  const ctx = await qa.context({ locale: 'uk', dark: false });
  const page = await qa.page(ctx, 'guest');

  const webId = await courseId('Основи веб-розробки');
  const tsId = await courseId('TypeScript для початківців');
  const sqlId = await courseId('Бази даних і SQL');

  await step(qa, page, 'home', async () => {
    await page.goto(BASE);
    await qa.snap(page, 'home');
    // open every FAQ item
    const items = page.locator('details');
    for (let i = 0; i < (await items.count()); i++) await items.nth(i).locator('summary').click();
    await qa.snap(page, 'home-faq-open', { axe: false });
  });

  await step(qa, page, 'catalog', async () => {
    await page.goto(`${BASE}/catalog`);
    await qa.snap(page, 'catalog');
    const search = page.getByRole('searchbox').first();
    // Type like a person (one key at a time) — debounced URL sync must not eat characters.
    await search.pressSequentially('SQL', { delay: 120 });
    await pause(1500);
    const typed = await search.inputValue();
    if (typed !== 'SQL') qa.add('catalog-search', 'bug', 'major', `search input lost characters while typing: expected "SQL", got "${typed}"`);
    await page.waitForURL(/search=SQL/);
    await qa.snap(page, 'catalog-search-sql', { axe: false });
    await search.fill('');
    await search.fill('zzzzqqq');
    await page.waitForURL(/search=zzzzqqq/);
    await pause(800);
    await qa.snap(page, 'catalog-empty', { axe: false });
    await page.getByRole('button', { name: /Скинути фільтри/ }).click();
    await pause(500);
    await page.getByRole('radio', { name: 'Платні', exact: true }).click();
    await page.waitForURL(/price=paid/);
    await pause(600);
    await qa.snap(page, 'catalog-paid', { axe: false });
    await page.getByRole('radio', { name: 'Безкоштовні', exact: true }).click();
    await page.waitForURL(/price=free/);
    await pause(600);
    await page.getByRole('radio', { name: 'Програмування', exact: true }).click();
    await pause(800);
    await qa.snap(page, 'catalog-free-programming', { axe: false });
    const sort = page.getByLabel('Сортування');
    if (await sort.count()) {
      const opts = await sort.locator('option').allTextContents();
      for (const o of opts) {
        await sort.selectOption({ label: o });
        await pause(400);
      }
    }
    await qa.snap(page, 'catalog-sorted', { axe: false });
  });

  for (const [tag, id] of [
    ['landing-free', webId],
    ['landing-paid', tsId],
    ['landing-approval', sqlId],
  ] as const) {
    await step(qa, page, tag, async () => {
      await page.goto(`${BASE}/c/${id}`);
      await qa.snap(page, tag);
    });
  }

  await step(qa, page, 'privacy-404', async () => {
    await page.goto(`${BASE}/privacy`);
    await qa.snap(page, 'privacy');
    await page.goto(`${BASE}/this-page-does-not-exist`);
    await qa.snap(page, '404');
    await page.goto(`${BASE}/c/999999`);
    await qa.snap(page, 'landing-404', { axe: false });
  });

  await step(qa, page, 'theme', async () => {
    await page.goto(BASE);
    const toggle = page.getByRole('button', { name: /тему/i }).first();
    await toggle.click();
    await pause(400);
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    if (theme !== 'dark') qa.add('theme', 'bug', 'major', `theme toggle did not switch to dark (data-theme=${theme})`);
    await qa.snap(page, 'home-dark');
    await page.goto(`${BASE}/catalog`);
    await qa.snap(page, 'catalog-dark');
    await page.goto(`${BASE}/c/${tsId}`);
    await qa.snap(page, 'landing-dark');
    await page.getByRole('button', { name: /тему/i }).first().click();
  });

  for (const loc of ['en', 'pl'] as const) {
    await step(qa, page, `lang-${loc}`, async () => {
      await page.goto(BASE);
      // New language menu: pill button → menu of radio items (mouse for en, keyboard for pl).
      const sw = page.locator('header').first().getByRole('button', { name: /Мова інтерфейсу|Interface language|Język interfejsu/ });
      if (loc === 'en') {
        await sw.click();
        await qa.snap(page, 'lang-menu-open', { fullPage: false });
        await page.getByRole('menuitemradio', { name: /English/ }).click();
      } else {
        await sw.focus();
        await page.keyboard.press('ArrowDown');
        await pause(300);
        const focused = await page.evaluate(() => document.activeElement?.textContent ?? '');
        if (!/Українська|English/.test(focused)) qa.add('lang-menu-keyboard', 'bug', 'minor', `ArrowDown on the language button focused "${focused}" instead of the current language`);
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
      }
      await pause(1200);
      const lang = await page.evaluate(() => document.documentElement.lang);
      if (lang !== loc) qa.add(`lang-${loc}`, 'bug', 'major', `html lang is ${lang} after switching to ${loc}`);
      await qa.snap(page, `home-${loc}`);
      await page.goto(`${BASE}/catalog`);
      await qa.snap(page, `catalog-${loc}`);
      await page.goto(`${BASE}/c/${tsId}`);
      await qa.snap(page, `landing-${loc}`);
      await page.goto(`${BASE}/login`);
      await qa.snap(page, `login-${loc}`);
      await page.goto(`${BASE}/register`);
      await qa.snap(page, `register-${loc}`);
    });
  }
  // back to Ukrainian
  await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'uk', url: BASE }]);

  await step(qa, page, 'login-errors', async () => {
    await page.goto(`${BASE}/login`);
    await page.locator('button[type=submit]').click();
    await qa.snap(page, 'login-empty-validation');
    await page.locator('input[type=email]').fill('student@lms.local');
    await page.locator('input[autocomplete="current-password"]').fill('wrong-password');
    await page.locator('button[type=submit]').click();
    await pause(1500);
    await qa.snap(page, 'login-wrong-password');
  });

  // Unconfirmed account: register via API without confirming.
  const unconfirmed = `qa-unconf-${Date.now().toString(36)}@qa.local`;
  await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: unconfirmed, password: 'qaPass1234', role: 'STUDENT' }),
  });
  await step(qa, page, 'login-unconfirmed', async () => {
    await page.goto(`${BASE}/login`);
    await page.locator('input[type=email]').fill(unconfirmed);
    await page.locator('input[autocomplete="current-password"]').fill('qaPass1234');
    await page.locator('button[type=submit]').click();
    await pause(1500);
    await qa.snap(page, 'login-unconfirmed');
  });

  await step(qa, page, 'register-validation', async () => {
    await page.goto(`${BASE}/register`);
    await page.locator('button[type=submit]').click();
    await qa.snap(page, 'register-empty');
    await page.locator('input[type=email]').fill('not-an-email');
    const pw = page.locator('input[type=password]').first();
    await pw.fill('abc');
    await qa.snap(page, 'register-weak-password', { axe: false });
    await pw.fill('Str0ng!Passw0rd');
    await qa.snap(page, 'register-strong-password', { axe: false });
  });

  for (const role of ['student', 'teacher'] as const) {
    await step(qa, page, `register-${role}`, async () => {
      const email = `qa-reg-${role}-${Date.now().toString(36)}@qa.local`;
      await page.goto(`${BASE}/register`);
      if (role === 'teacher') await page.getByText('Викладач', { exact: true }).first().click();
      await page.getByLabel(/Ім.я/).fill('Тест');
      await page.getByLabel(/Прізвище/).fill(role === 'teacher' ? 'Викладач' : 'Студент');
      await page.locator('input[type=email]').fill(email);
      await page.locator('input[type=password]').first().fill('qaPass1234');
      await page.locator('input[type=checkbox]').first().check();
      await qa.snap(page, `register-${role}-filled`, { axe: false });
      await page.locator('button[type=submit]').click();
      await page.waitForURL(/confirm/);
      await qa.snap(page, `confirm-${role}-check-mail`);
      await page.getByRole('link', { name: /Підтвердити email/ }).click();
      await pause(1500);
      await qa.snap(page, `confirm-${role}-done`);
      await page.getByRole('link', { name: /Перейти до входу/ }).click();
      await page.waitForURL(/login/);
      await page.locator('input[type=email]').fill(email);
      await page.locator('input[autocomplete="current-password"]').fill('qaPass1234');
      await page.locator('button[type=submit]').click();
      await page.waitForURL((u) => !u.pathname.startsWith('/login'));
      await qa.snap(page, `first-login-${role}`);
      await page.getByRole('button', { name: /Меню користувача/ }).click();
      await page.getByRole('menuitem', { name: /Вийти/ }).click();
      await page.waitForURL(/login|\/$/);
    });
  }

  await step(qa, page, 'forgot-reset', async () => {
    const user = await qa.freshUser('reset');
    await page.goto(`${BASE}/forgot-password`);
    await qa.snap(page, 'forgot');
    await page.locator('input[type=email]').fill(user.email);
    await page.locator('button[type=submit]').click();
    await pause(1500);
    await qa.snap(page, 'forgot-sent');
    const demo = page.getByRole('link', { name: /демо|скинути|Встановити/i }).first();
    const demoBtn = page.getByRole('button', { name: /демо/i }).first();
    if (await demoBtn.count()) await demoBtn.click();
    else if (await demo.count()) await demo.click();
    await page.waitForURL(/reset-password/, { timeout: 10_000 });
    await qa.snap(page, 'reset-form');
    const pws = page.locator('input[type=password]');
    await pws.nth(0).fill('newPass5678');
    if ((await pws.count()) > 1) await pws.nth(1).fill('newPass5678');
    await page.locator('button[type=submit]').click();
    await pause(1500);
    await qa.snap(page, 'reset-done');
    await qa.login(page, user.email, 'newPass5678');
    await qa.snap(page, 'login-after-reset', { axe: false });
    await page.getByRole('button', { name: /Меню користувача/ }).click();
    await page.getByRole('menuitem', { name: /Вийти/ }).click();
  });

  await step(qa, page, 'next-redirect', async () => {
    await page.goto(`${BASE}/my-courses`);
    await page.waitForURL(/login\?next=/);
    await qa.snap(page, 'login-next', { axe: false });
    await page.locator('input[type=email]').fill('student@lms.local');
    await page.locator('input[autocomplete="current-password"]').fill('demo1234');
    await page.locator('button[type=submit]').click();
    await page.waitForURL(/my-courses/);
    await qa.snap(page, 'redirected-my-courses', { axe: false });
  });

  // Mobile guest
  const m = await qa.context({ mobile: true, locale: 'uk' });
  const mp = await qa.page(m, 'guest-mobile');
  await step(qa, mp, 'mobile-guest', async () => {
    await mp.goto(BASE);
    await qa.snap(mp, 'm-home');
    const culprits = await overflowCulprits(mp);
    if (culprits.length) qa.add('m-home', 'bug', 'major', `mobile overflow culprits: ${culprits.join(' | ')}`);
    await mp.goto(`${BASE}/catalog`);
    await qa.snap(mp, 'm-catalog');
    const filtersBtn = mp.getByRole('button', { name: /Фільтри/ });
    if (await filtersBtn.count()) {
      await filtersBtn.click();
      await qa.snap(mp, 'm-catalog-filters', { axe: false });
    }
    await mp.goto(`${BASE}/c/${tsId}`);
    await qa.snap(mp, 'm-landing');
    await mp.goto(`${BASE}/login`);
    await qa.snap(mp, 'm-login');
    await mp.goto(`${BASE}/register`);
    await qa.snap(mp, 'm-register');
  });

  await qa.finish();
})();
