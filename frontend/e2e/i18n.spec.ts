import { expect, test } from '@playwright/test';
import { api, apiToken, failOnPageErrors, login, uid } from './helpers';

test.beforeEach(({ page }) => failOnPageErrors(page));

/** Registers and confirms a fresh student through the API (dev mail mode). */
async function freshUser() {
  const user = { email: `i18n-${uid()}@e2e.test`, password: 'demo1234' };
  const reg = await api<{ confirmToken?: string }>('/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify({ ...user, role: 'STUDENT', firstName: 'Ola', lastName: 'Test' }),
  });
  await api('/auth/confirm', undefined, {
    method: 'POST',
    body: JSON.stringify({ token: reg.confirmToken }),
  });
  return user;
}

test('guest switches the interface to English and it sticks after reload', async ({ page, context }) => {
  await page.goto('/catalog');
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk');
  await page.getByLabel('Мова інтерфейсу').selectOption('en');

  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const header = page.locator('header').first();
  await expect(header.getByRole('link', { name: 'Log in' })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Sign up' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Footer navigation' }).getByRole('link', { name: 'Privacy' })).toBeVisible();

  const cookie = (await context.cookies()).find((c) => c.name === 'NEXT_LOCALE');
  expect(cookie?.value).toBe('en');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByLabel('Interface language')).toHaveValue('en');
});

test('signed-in user picks Polski in the profile; it follows them to a new session', async ({ page, context }) => {
  const user = await freshUser();
  await login(page, user, '/profile');

  await page.getByRole('button', { name: 'Polski' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(page.getByRole('navigation', { name: 'Nawigacja główna' })).toBeVisible();

  const token = await apiToken(user);
  await expect
    .poll(async () => (await api<{ profile: { locale: string } }>('/users/me', token)).profile.locale)
    .toBe('pl');

  await page.getByRole('button', { name: 'Menu użytkownika' }).click();
  await page.getByRole('menuitem', { name: 'Wyloguj się' }).click();
  await expect(page).toHaveURL(/\/login/);

  // A new device: no language cookie, so the login page is Ukrainian again…
  await context.clearCookies();
  await login(page, user);
  // …and after sign-in the saved profile language takes over.
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(page.getByRole('navigation', { name: 'Nawigacja główna' })).toBeVisible();
});

test('the browser language is used when there is no cookie', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'pl-PL' });
  const page = await ctx.newPage();
  await page.goto('/catalog');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await ctx.close();
});
