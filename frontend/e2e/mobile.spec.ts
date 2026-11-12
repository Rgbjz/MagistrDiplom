import { expect, test } from '@playwright/test';
import { api, apiToken, catalogAll, failOnPageErrors, login, uid, USERS } from './helpers';

/** Phone layout (Pixel 7): bottom tab bar, course bottom sheet, test runner, chat panes. */

interface CourseDetail {
  sections: {
    title: string;
    lessons: { id: number; title: string; test: { id: number } | null }[];
  }[];
}

let webCourseId: number;

test.beforeAll(async () => {
  const web = (await catalogAll()).find((c) => c.title === 'Основи веб-розробки');
  if (!web) throw new Error('Seeded course «Основи веб-розробки» not found');
  webCourseId = web.id;
});

test.beforeEach(async ({ page }) => {
  failOnPageErrors(page);
});

test('bottom tab bar replaces the header navigation', async ({ page }) => {
  await login(page, USERS.student);
  const tabs = page.getByRole('navigation', { name: 'Нижнє меню' });
  await expect(tabs).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Головна навігація' })).toBeHidden();

  for (const [label, url] of [
    ['Курси', /\/my-courses$/],
    ['Чат', /\/chat/],
    ['Профіль', /\/profile$/],
    ['Головна', /\/$/],
  ] as const) {
    await tabs.getByRole('link', { name: label }).click();
    await expect(page).toHaveURL(url);
    await expect(tabs.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
  }
});

test('course contents open as a bottom sheet', async ({ page }) => {
  await login(page, USERS.student, `/courses/${webCourseId}`);
  await expect(page.getByRole('navigation', { name: 'Зміст курсу' })).toBeHidden();

  const toggle = page.getByRole('button', { name: /^Зміст курсу/ });
  await expect(toggle).toBeVisible();
  await toggle.click();
  const sheet = page.getByRole('dialog', { name: 'Зміст курсу' });
  await expect(sheet).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  // Picking an item closes the sheet and opens it.
  const items = sheet.locator('ol button');
  const target = items.first();
  const label = (await target.innerText()).trim().split('\n')[0];
  await target.click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\?(lesson|test)=\d+$/);
  expect(label.length).toBeGreaterThan(0);

  // Close button works too.
  await toggle.click();
  await page.getByRole('button', { name: 'Закрити зміст' }).click();
  await expect(sheet).toBeHidden();
});

test('test runner is usable on a phone', async ({ page }) => {
  const email = `e2e-mobile-${uid()}@lms.local`;
  const reg = await api<{ confirmToken?: string }>('/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password: 'demo1234', role: 'STUDENT', firstName: 'Моб', lastName: 'Тест' }),
  });
  await api('/auth/confirm', undefined, { method: 'POST', body: JSON.stringify({ token: reg.confirmToken }) });
  const user = { email, password: 'demo1234' };
  const token = await apiToken(user);
  await api(`/courses/${webCourseId}/enroll`, token, { method: 'POST' });
  const course = await api<CourseDetail>(`/courses/${webCourseId}`, token);
  const testId = course.sections.flatMap((s) => s.lessons).find((l) => l.test)!.test!.id;

  await login(page, user, `/courses/${webCourseId}?test=${testId}`);
  await page.getByRole('button', { name: 'Почати тест' }).click();
  await expect(page.getByRole('timer')).toBeVisible();

  const counter = page.getByText(/^Питання \d+ з \d+$/);
  const total = Number((await counter.textContent())!.match(/з (\d+)/)![1]);
  for (let i = 0; i < total; i++) {
    const option = page.locator('fieldset button[aria-pressed]').first();
    await option.scrollIntoViewIfNeeded();
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    if (i < total - 1) await page.getByRole('button', { name: /^Наступне/ }).click();
  }
  // On phones the finish button sits in the bottom navigation row.
  const finish = page.getByRole('button', { name: 'Завершити тест' }).filter({ visible: true });
  await finish.last().click();
  await expect(page).toHaveURL(new RegExp(`/tests/${testId}/result$`));
  await expect(page.getByLabel(/^Результат \d+ відсотків$/)).toBeVisible();
});

test('chat: list → thread → back to list', async ({ page }) => {
  await login(page, USERS.student, '/chat');
  const list = page.getByRole('complementary', { name: 'Розмови' });
  await expect(list).toBeVisible();

  await list.getByRole('button', { name: /Ірина Мельник/ }).click();
  const back = page.getByRole('button', { name: 'Назад до списку розмов' });
  await expect(back).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Повідомлення' })).toBeVisible();
  await expect(list).toBeHidden();

  await back.click();
  await expect(list).toBeVisible();
  await expect(back).toBeHidden();
});
