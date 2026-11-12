import { expect, test, type Browser, type Page } from '@playwright/test';
import { API_URL, USERS, api, apiToken, failOnPageErrors, login, uid } from './helpers';

/**
 * Admin panel through the real UI: stats, users (search, role filter,
 * pagination, role change, block/unblock), courses and payments.
 * Role/block changes only touch users created by this spec.
 */

interface FreshUser {
  email: string;
  password: string;
  name: string;
}

async function registerUser(prefix = 'admin-e2e'): Promise<FreshUser> {
  const id = uid();
  const email = `${prefix}-${id}@e2e.local`;
  const password = 'Fresh-pass-123';
  const lastName = `Адмінтест${id.slice(-4)}`;
  const reg = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role: 'STUDENT', firstName: 'Юзер', lastName }),
  });
  const { confirmToken } = (await reg.json()) as { confirmToken?: string };
  if (!confirmToken) throw new Error('Expected a dev confirm token (SMTP must be off)');
  const conf = await fetch(`${API_URL}/auth/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: confirmToken }),
  });
  if (!conf.ok) throw new Error(`confirm failed: ${conf.status}`);
  return { email, password, name: `Юзер ${lastName}` };
}

/** Fills the login form; doesn't assert success (used for blocked users). */
async function submitLogin(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.locator('input[autocomplete="current-password"]').fill(user.password);
  await page.getByRole('button', { name: 'Увійти', exact: true }).click();
}

async function freshPage(browser: Browser) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'uk-UA' });
  const page = await context.newPage();
  failOnPageErrors(page);
  return page;
}

function usersSection(page: Page) {
  return page.getByRole('region', { name: 'Користувачі' });
}

/** The open <dialog>, found by its heading (Modals share id="modal-title"). */
function openDialog(page: Page, title: string) {
  return page.locator('dialog[open]').filter({ has: page.getByRole('heading', { name: title }) });
}

async function findUser(page: Page, email: string) {
  const users = usersSection(page);
  await users.getByPlaceholder('Пошук за email або ім’ям').fill(email);
  const row = users.getByRole('row', { name: new RegExp(email.replace(/[.]/g, '\\.')) });
  await expect(row).toBeVisible();
  await expect(users.getByRole('row')).toHaveCount(2); // header + match
  return row;
}

test.describe.configure({ mode: 'serial' });

const fresh: { promoted?: FreshUser; blocked?: FreshUser } = {};

test.beforeAll(async () => {
  fresh.promoted = await registerUser('admin-role');
  fresh.blocked = await registerUser('admin-block');
  // Guarantee more than one page of users (page size 20).
  const token = await apiToken(USERS.admin);
  const stats = await api<{ users: number }>('/admin/stats', token);
  for (let i = stats.users; i <= 21; i++) await registerUser('admin-filler');
});

test.beforeEach(({ page }) => {
  failOnPageErrors(page);
});

test('admin lands on the panel and sees platform stats', async ({ page }) => {
  await login(page, USERS.admin);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Адмін-панель' })).toBeVisible();

  const stats = page.getByRole('region', { name: 'Статистика платформи' });
  await expect(stats.getByText(/^Користувачів · \d+ студ\., \d+ адм\.$/)).toBeVisible();
  await expect(stats.getByText('Викладачів', { exact: true })).toBeVisible();
  await expect(stats.getByText(/^Курсів · /)).toBeVisible();
  await expect(stats.getByText(/^Платежі за місяць · /)).toBeVisible();

  // "/" sends the admin back to the panel.
  await page.goto('/');
  await expect(page).toHaveURL(/\/admin$/);
});

test('users: search, role filter, pagination and own row is locked', async ({ page }) => {
  await login(page, USERS.admin, '/admin');
  const users = usersSection(page);
  await expect(users.getByRole('row').nth(1)).toBeVisible();

  // Pagination.
  const pager = page.getByRole('navigation', { name: 'Сторінки користувачів' });
  await expect(pager.getByText(/Сторінка 1 з \d+/)).toBeVisible();
  await pager.getByRole('button', { name: 'Далі' }).click();
  await expect(pager.getByText(/Сторінка 2 з \d+/)).toBeVisible();
  await pager.getByRole('button', { name: 'Назад' }).click();
  await expect(pager.getByText(/Сторінка 1 з \d+/)).toBeVisible();

  // Search.
  await findUser(page, fresh.promoted!.email);

  // Role filter: only admins; the admin's own row can't be changed.
  await users.getByPlaceholder('Пошук за email або ім’ям').fill('');
  // Toolbar filter: the first combobox (its label name also includes the selected option).
  await users.getByRole('combobox').first().selectOption({ label: 'Адміністратор' });
  const own = users.getByRole('row', { name: /admin@lms\.local/ });
  await expect(own).toBeVisible();
  await expect(own.getByText('(ви)')).toBeVisible();
  await expect(own.getByRole('combobox')).toBeDisabled();
  await expect(own.getByRole('button', { name: 'Заблокувати' })).toBeDisabled();
  await expect(users.getByRole('row', { name: /student@lms\.local/ })).toHaveCount(0);
});

test('changing a user role to teacher gives them the teacher dashboard', async ({ page, browser }) => {
  const user = fresh.promoted!;
  await login(page, USERS.admin, '/admin');
  const row = await findUser(page, user.email);
  await row.getByLabel(`Роль ${user.name}`).selectOption({ label: 'Викладач' });
  await expect(page.getByText('Роль змінено на «Викладач»')).toBeVisible();
  await expect(row.getByLabel(`Роль ${user.name}`)).toHaveValue('TEACHER');

  const up = await freshPage(browser);
  await login(up, user);
  await expect(up.getByRole('link', { name: 'Створити курс' }).first()).toBeVisible();
  await expect(up.getByRole('heading', { name: 'Мої курси' })).toBeVisible();
  await up.context().close();
});

test('blocking a user stops their login until unblocked', async ({ page, browser }) => {
  const user = fresh.blocked!;
  await login(page, USERS.admin, '/admin');
  const row = await findUser(page, user.email);

  await row.getByRole('button', { name: 'Заблокувати' }).click();
  const dialog = openDialog(page, 'Заблокувати користувача?');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/не зможе увійти в систему/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Заблокувати' }).click();
  await expect(page.getByText('Користувача заблоковано')).toBeVisible();
  await expect(row.getByText('Заблоковано', { exact: true })).toBeVisible();

  const up = await freshPage(browser);
  await submitLogin(up, user);
  await expect(up.getByRole('alert').filter({ hasText: 'Акаунт заблоковано адміністратором' })).toBeVisible();
  await expect(up).toHaveURL(/\/login/);

  await row.getByRole('button', { name: 'Розблокувати' }).click();
  await expect(page.getByText('Користувача розблоковано')).toBeVisible();
  await expect(row.getByText('Заблоковано', { exact: true })).toHaveCount(0);

  await login(up, user);
  await expect(up).not.toHaveURL(/\/login/);
  await up.context().close();
});

test('courses and payments tabs render', async ({ page }) => {
  await login(page, USERS.admin, '/admin');

  await page.getByRole('tab', { name: 'Курси' }).click();
  const courses = page.getByRole('region', { name: 'Курси' });
  const web = courses.getByRole('row', { name: /Основи веб-розробки/ });
  await expect(web).toBeVisible();
  await expect(web.getByText('Опубліковано')).toBeVisible();
  await expect(courses.getByRole('row', { name: /Алгоритми та структури даних/ }).getByText('Чернетка')).toBeVisible();

  await page.getByRole('tab', { name: 'Платежі' }).click();
  const payments = page.getByRole('region', { name: 'Останні платежі' });
  await expect(payments).toBeVisible();
  await expect(
    payments.getByRole('columnheader', { name: 'Сума' }).or(payments.getByText('Платежів ще немає')),
  ).toBeVisible();
});

test('non-admins are kept out of /admin', async ({ page }) => {
  await login(page, USERS.teacher2, '/admin');
  await expect(page).not.toHaveURL(/\/admin/);
});
