import { BASE, Phase, pause } from './h';

(async () => {
  const ph = new Phase('guest');
  const p = await ph.attach();
  await ph.ctx.clearCookies();

  await ph.step('welcome', async () => {
    await p.goto(BASE);
    await ph.snap('welcome');
    const items = p.locator('details');
    for (let i = 0; i < (await items.count()); i++) await items.nth(i).locator('summary').click();
    await ph.snap('welcome-faq-open', { axe: false });
  });

  await ph.step('catalog', async () => {
    await p.goto(`${BASE}/catalog`);
    await ph.snap('catalog');
    const search = p.getByRole('searchbox').first();
    await search.pressSequentially('HTML', { delay: 120 });
    await p.waitForURL(/search=HTML/);
    await pause(800);
    if ((await search.inputValue()) !== 'HTML') ph.add('catalog', 'bug', 'major', 'search input lost characters');
    await ph.snap('catalog-search-html', { axe: false });
    await search.fill('');
    await search.fill('zzzqqq');
    await p.waitForURL(/search=zzzqqq/);
    await pause(800);
    await ph.snap('catalog-empty', { axe: false });
    await p.getByRole('button', { name: /Скинути фільтри/ }).click();
    await p.getByRole('radio', { name: 'Платні' }).first().check().catch(() => undefined);
    await pause(800);
    await ph.snap('catalog-paid', { axe: false });
    await p.getByRole('radio', { name: 'Усі' }).first().check().catch(() => undefined);
    const sort = p.getByRole('combobox').first();
    for (const o of await sort.locator('option').allTextContents()) {
      await sort.selectOption({ label: o });
      await pause(500);
    }
    await ph.snap('catalog-sorted', { axe: false });
  });

  await ph.step('landing-youtube-course', async () => {
    await p.goto(`${BASE}/catalog?search=${encodeURIComponent('HTML з нуля')}`);
    await p.getByRole('link', { name: /HTML з нуля/ }).first().click();
    await p.waitForURL(/\/c\/\d+/);
    await ph.snap('landing-html');
    const previews = await p.locator('img[src*="ytimg.com"]').count();
    if (previews < 10) ph.add('landing-html', 'bug', 'minor', `only ${previews} lesson previews on the landing`);
    // «Написати» as a guest → sign-in page.
    await p.getByRole('button', { name: /^Написати/ }).first().click();
    await p.waitForURL(/\/login/);
    await ph.snap('landing-message-guest-login', { axe: false, full: false });
  });

  await ph.step('landing-paid-and-approval', async () => {
    for (const title of ['TypeScript для початківців', 'Бази даних і SQL']) {
      await p.goto(`${BASE}/catalog?search=${encodeURIComponent(title)}`);
      await p.getByRole('link', { name: new RegExp(title) }).first().click();
      await p.waitForURL(/\/c\/\d+/);
      await ph.snap(`landing-${title.slice(0, 10)}`);
    }
  });

  await ph.step('not-found', async () => {
    await p.goto(`${BASE}/this-page-does-not-exist`);
    await ph.snap('404', { full: false });
    await p.goto(`${BASE}/c/999999`);
    await ph.snap('course-404', { full: false });
  });

  await ph.step('privacy', async () => {
    await p.goto(`${BASE}/privacy`);
    await ph.snap('privacy');
  });

  await ph.step('language-menu', async () => {
    await p.goto(`${BASE}/catalog`);
    const btn = () => p.locator('header').first().getByRole('button', { name: /Мова інтерфейсу|Interface language|Język interfejsu/ });
    // Mouse: open, check the current one, pick English.
    await btn().click();
    await pause(400);
    await ph.snap('lang-menu-open', { full: false });
    const checked = await p.getByRole('menuitemradio', { checked: true }).textContent();
    if (!/Українська/.test(checked ?? '')) ph.add('lang', 'bug', 'minor', `checked item is "${checked}"`);
    await p.getByRole('menuitemradio', { name: /English/ }).click();
    await p.waitForFunction(() => document.documentElement.lang === 'en');
    await pause(600);
    await ph.snap('catalog-en');
    // Keyboard: focus button, ArrowDown opens on the current item, End → Polski, Enter.
    await btn().focus();
    await p.keyboard.press('ArrowDown');
    await pause(400);
    const focused = await p.evaluate(() => document.activeElement?.textContent ?? '');
    if (!/English/.test(focused)) ph.add('lang', 'bug', 'minor', `keyboard open focused "${focused}", expected the current language`);
    await p.keyboard.press('End');
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => document.documentElement.lang === 'pl');
    await pause(600);
    await ph.snap('catalog-pl');
    // Esc closes and returns focus to the button.
    await btn().click();
    await p.keyboard.press('Escape');
    const back = await p.evaluate(() => document.activeElement?.getAttribute('aria-haspopup'));
    if (back !== 'menu') ph.add('lang', 'bug', 'minor', 'Esc did not return focus to the language button');
    // Back to Ukrainian.
    await btn().click();
    await p.getByRole('menuitemradio', { name: /Українська/ }).click();
    await p.waitForFunction(() => document.documentElement.lang === 'uk');
  });

  await ph.step('dark-theme', async () => {
    await p.goto(`${BASE}/`);
    await p.getByRole('button', { name: /тему/i }).first().click();
    await pause(500);
    await ph.snap('welcome-dark');
    await p.goto(`${BASE}/catalog`);
    await ph.snap('catalog-dark');
    await p.getByRole('button', { name: /тему/i }).first().click();
  });

  await ph.done();
})();
