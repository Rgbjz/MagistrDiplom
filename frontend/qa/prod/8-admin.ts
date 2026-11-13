import { BASE, Phase, pause, state, uiLogin } from './h';

type Acc = { email: string; password: string; name: string };

(async () => {
  const ph = new Phase('admin');
  const p = await ph.attach();
  const { S4 } = state<{ S4: Acc }>();

  await uiLogin(ph, 'admin@lms.local', 'admin123', '/admin');

  await ph.step('stats', async () => {
    await p.getByRole('heading', { level: 1, name: 'Адмін-панель' }).waitFor();
    await pause(1500);
    await ph.snap('admin-stats');
  });

  const users = p.getByRole('region', { name: 'Користувачі' });

  await ph.step('users-search-filter-pages', async () => {
    const pager = p.getByRole('navigation', { name: 'Сторінки користувачів' });
    if (await pager.count()) {
      await pager.getByRole('button', { name: 'Далі' }).click();
      await pause(1000);
      await ph.snap('users-page-2', { axe: false });
      await pager.getByRole('button', { name: 'Назад' }).click();
    }
    await users.getByRole('combobox').first().selectOption({ label: 'Викладач' });
    await pause(1000);
    await ph.snap('users-teachers', { axe: false });
    await users.getByRole('combobox').first().selectOption({ index: 0 });
    await users.getByRole('searchbox').fill('qa-');
    await pause(1500);
    await ph.snap('users-search-qa');
  });

  await ph.step('qa-user-role-and-block', async () => {
    await users.getByRole('searchbox').fill(S4.email);
    await pause(1500);
    const row = users.getByRole('row', { name: new RegExp(S4.email.replace(/[.]/g, '\\.')) });
    await row.getByLabel(`Роль ${S4.name}`).selectOption({ label: 'Викладач' });
    await pause(1500);
    if ((await row.getByLabel(`Роль ${S4.name}`).inputValue()) !== 'TEACHER') ph.add('admin', 'bug', 'major', 'role change did not stick');
    await row.getByLabel(`Роль ${S4.name}`).selectOption({ label: 'Студент' });
    await pause(1000);
    await row.getByRole('button', { name: 'Заблокувати' }).click();
    const dlg = p.getByRole('dialog').filter({ hasText: /Заблокувати/ }).last();
    await dlg.getByRole('button', { name: 'Заблокувати' }).click();
    await pause(1500);
    await ph.snap('qa-user-blocked', { full: false });
    await row.getByRole('button', { name: 'Розблокувати' }).click();
    const d2 = p.getByRole('dialog').filter({ hasText: /Розблокувати/ });
    if (await d2.count()) await d2.last().getByRole('button', { name: 'Розблокувати' }).click();
    await pause(1500);
    await ph.snap('qa-user-unblocked', { full: false, axe: false });
    // Own row is protected.
    await users.getByRole('searchbox').fill('admin@lms.local');
    await pause(1500);
    const own = users.getByRole('row', { name: /admin@lms\.local/ });
    if (!(await own.getByRole('button', { name: 'Заблокувати' }).isDisabled())) ph.add('admin', 'bug', 'major', 'admin can block themself');
  });

  await ph.step('courses-and-payments', async () => {
    await p.getByRole('tab', { name: 'Курси' }).click();
    await pause(1500);
    await ph.snap('admin-courses');
    await p.getByRole('tab', { name: 'Платежі' }).click();
    await pause(1500);
    await ph.snap('admin-payments');
  });

  await ph.step('admin-en', async () => {
    const btn = p.locator('header').first().getByRole('button', { name: /Мова інтерфейсу/ });
    await btn.click();
    await p.getByRole('menuitemradio', { name: /English/ }).click();
    await p.waitForFunction(() => document.documentElement.lang === 'en');
    await pause(1200);
    await ph.snap('admin-en');
    await p.locator('header').first().getByRole('button', { name: /Interface language/ }).click();
    await p.getByRole('menuitemradio', { name: /Українська/ }).click();
    await p.waitForFunction(() => document.documentElement.lang === 'uk');
  });

  await ph.done();
})();
