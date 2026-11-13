import { BASE, Phase, pause } from './h';

(async () => {
  const ph = new Phase('welcome');
  const p = await ph.attach();
  await ph.ctx.clearCookies();

  await ph.step('welcome-uk', async () => {
    await p.goto(`${BASE}/`);
    await pause(1500);
    await ph.snap('welcome-uk');
    // Hero search → catalog with the query.
    const search = p.getByRole('searchbox').first();
    await search.fill('HTML');
    await search.press('Enter');
    await p.waitForURL(/\/catalog\?search=HTML/, { timeout: 15_000 });
    await ph.snap('welcome-search-result', { axe: false });
    await p.goBack();
    await pause(1000);
  });

  await ph.step('welcome-links', async () => {
    const cats = p.locator('a[href*="/catalog?category="]');
    const n = await cats.count();
    if (!n) ph.add('welcome', 'bug', 'minor', 'no category links on the home page');
    else {
      const href = await cats.first().getAttribute('href');
      await cats.first().click();
      await p.waitForURL(/category=/);
      const found = await p.getByText(/Знайдено/).first().innerText().catch(() => '');
      if (/Знайдено 0/.test(found)) ph.add('welcome', 'bug', 'minor', `category link ${href} shows 0 courses`);
      await ph.snap('welcome-category', { axe: false });
      await p.goBack();
      await pause(800);
    }
    // Every course link on the home page resolves.
    const courseLinks = await p.locator('main a[href^="/c/"]').evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute('href')))]);
    for (const href of courseLinks.slice(0, 8)) {
      const r = await p.request.get(`${BASE}${href}`);
      if (r.status() !== 200) ph.add('welcome', 'bug', 'major', `course link ${href} → ${r.status()}`);
    }
    const items = p.locator('details');
    for (let i = 0; i < (await items.count()); i++) await items.nth(i).locator('summary').click();
    await ph.snap('welcome-faq-open', { axe: false });
  });

  await ph.step('welcome-en-pl', async () => {
    for (const [re, lang] of [[/English/, 'en'], [/Polski/, 'pl']] as const) {
      await p.locator('header').first().getByRole('button', { name: /Мова інтерфейсу|Interface language|Język interfejsu/ }).click();
      await p.getByRole('menuitemradio', { name: re }).click();
      await p.waitForFunction((l) => document.documentElement.lang === l, lang);
      await pause(1200);
      await ph.snap(`welcome-${lang}`);
    }
    await p.locator('header').first().getByRole('button', { name: /Język interfejsu/ }).click();
    await p.getByRole('menuitemradio', { name: /Українська/ }).click();
    await p.waitForFunction(() => document.documentElement.lang === 'uk');
  });

  await ph.step('welcome-dark', async () => {
    await p.getByRole('button', { name: /тему/i }).first().click();
    await pause(700);
    await ph.snap('welcome-dark');
    await p.getByRole('button', { name: /тему/i }).first().click();
  });

  await ph.done();
})();
