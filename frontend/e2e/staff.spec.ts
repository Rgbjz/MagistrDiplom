import { expect, test } from '@playwright/test';
import { api, API_URL, apiToken, failOnPageErrors, login, uid, USERS } from './helpers';

/**
 * Course team: the owner adds a second teacher and a student-account assistant;
 * each sees exactly what their course role allows.
 */

const PASSWORD = 'demo1234';
type Account = { email: string; password: string; id: number; name: string };

const state: {
  courseId: number;
  lessonTitle: string;
  assignmentId: number;
  assistant: Account;
  learner: Account;
} = {} as never;

async function freshStudent(tag: string): Promise<Account> {
  const email = `e2e-staff-${tag}-${uid()}@lms.local`;
  const lastName = `Команда${tag}`;
  const reg = await api<{ confirmToken?: string }>('/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD, role: 'STUDENT', firstName: 'Асистент', lastName }),
  });
  if (!reg.confirmToken) throw new Error('No confirmToken: backend must run without SMTP');
  await api('/auth/confirm', undefined, { method: 'POST', body: JSON.stringify({ token: reg.confirmToken }) });
  const user = { email, password: PASSWORD };
  const me = await api<{ id: number }>('/users/me', await apiToken(user));
  return { ...user, id: me.id, name: `Асистент ${lastName}` };
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(({ page }) => failOnPageErrors(page));

test.beforeAll(async () => {
  const owner = await apiToken(USERS.teacher1);
  const form = new FormData();
  form.append('title', `E2E команда ${uid()}`);
  form.append('description', 'Курс для перевірки ролей команди');
  form.append('price', '0');
  form.append('published', 'true');
  form.append('autoApprove', 'true');
  const res = await fetch(`${API_URL}/courses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner}` },
    body: form,
  });
  if (!res.ok) throw new Error(`course: ${res.status} ${await res.text()}`);
  state.courseId = ((await res.json()) as { id: number }).id;

  const section = await api<{ id: number }>(`/sections/${state.courseId}`, owner, {
    method: 'POST',
    body: JSON.stringify({ title: 'Вступ' }),
  });
  state.lessonTitle = 'Урок для команди';
  const lesson = await api<{ id: number }>(`/lessons/${section.id}`, owner, {
    method: 'POST',
    body: JSON.stringify({ title: state.lessonTitle, content: '<p>Матеріал.</p>' }),
  });
  const assignment = await api<{ id: number }>(`/lessons/${lesson.id}/assignment`, owner, {
    method: 'POST',
    body: JSON.stringify({ title: 'Есе про команду', maxScore: 100 }),
  });
  state.assignmentId = assignment.id;

  state.assistant = await freshStudent('A');
  state.learner = await freshStudent('L');
  const learner = await apiToken(state.learner);
  await api(`/courses/${state.courseId}/enroll`, learner, { method: 'POST' });
  const submission = new FormData();
  submission.append('files', new Blob(['Моє есе'], { type: 'text/plain' }), 'esse.txt');
  const sub = await fetch(`${API_URL}/assignments/${state.assignmentId}/submission`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${learner}` },
    body: submission,
  });
  if (!sub.ok) throw new Error(`submission: ${sub.status} ${await sub.text()}`);
});

test('owner adds a teacher and a student-account assistant on the Team tab', async ({ page }) => {
  await login(page, USERS.teacher1, `/courses/${state.courseId}/manage?tab=team`);
  await expect(page.getByRole('tab', { name: 'Команда' })).toHaveAttribute('aria-selected', 'true');

  const invite = page.getByRole('heading', { name: 'Додати до команди' }).locator('xpath=ancestor::form');
  await invite.getByLabel('Email').fill(USERS.teacher2.email);
  await invite.getByLabel('Роль').selectOption('TEACHER');
  await invite.getByRole('button', { name: 'Додати' }).click();
  await expect(page.getByText('Учасника додано до команди')).toBeVisible();

  // A student account can't become a course teacher…
  await invite.getByLabel('Email').fill(state.assistant.email);
  await invite.getByLabel('Роль').selectOption('TEACHER');
  await invite.getByRole('button', { name: 'Додати' }).click();
  await expect(
    page.getByText('Викладачем курсу може бути лише обліковий запис викладача'),
  ).toBeVisible();
  // …but can be an assistant.
  await invite.getByLabel('Роль').selectOption('ASSISTANT');
  await invite.getByRole('button', { name: 'Додати' }).click();
  await expect(page.getByRole('row', { name: new RegExp(state.assistant.email) })).toBeVisible();

  const table = page.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(4); // header + owner + teacher + assistant
  await expect(table.getByRole('row', { name: /Власник/ })).toBeVisible();
});

test('a team teacher edits content but sees no price, delete or team controls', async ({ page }) => {
  await login(page, USERS.teacher2, `/teacher/courses/${state.courseId}/builder`);
  const structure = page.getByRole('complementary', { name: 'Структура курсу' });
  await structure.getByRole('button', { name: state.lessonTitle, exact: true }).click();
  const title = `${state.lessonTitle} (оновлено)`;
  await page.getByLabel('Назва уроку').fill(title);
  await page.getByRole('button', { name: 'Зберегти урок' }).click();
  await expect(page.getByText('Урок збережено')).toBeVisible();
  await expect(structure.getByRole('button', { name: 'Видалити курс' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Налаштування і ціна' }).click();
  await expect(page.getByText('Ціну й тип доступу змінює лише власник курсу.')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Платний' })).toBeDisabled();

  await page.goto(`/courses/${state.courseId}/manage?tab=team`);
  await expect(page.getByText('Склад команди змінює лише власник курсу.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Додати до команди' })).toHaveCount(0);

  // Pricing is the owner's call, even through the API.
  const res = await fetch(`${API_URL}/courses/${state.courseId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${await apiToken(USERS.teacher2)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ price: 999 }),
  });
  expect(res.status).toBe(403);
});

test('the assistant grades work but cannot open the builder or edit the course', async ({ page }) => {
  await login(page, state.assistant);
  await expect(page.getByRole('heading', { name: 'Курси, де я асистент' })).toBeVisible();

  await page.goto(`/courses/${state.courseId}/manage?tab=assignments`);
  await expect(page.getByRole('link', { name: 'Конструктор' })).toHaveCount(0);
  const block = page.getByRole('region', { name: 'Есе про команду' });
  const row = block.getByRole('row', { name: new RegExp(state.learner.name) });
  await row.getByRole('button', { name: 'Перевірити' }).click();
  const dialog = page.getByRole('dialog', { name: `Робота: ${state.learner.name}` });
  await dialog.getByLabel(/Оцінка/).fill('90');
  await dialog.getByRole('button', { name: 'Оцінити' }).click();
  await expect(page.getByText('Оцінку збережено')).toBeVisible();
  await expect(row.getByText('Перевірено 90/100')).toBeVisible();

  // The builder is for teacher accounts; the API refuses content edits.
  await page.goto(`/teacher/courses/${state.courseId}/builder`);
  await expect(page).toHaveURL(/\/$/);
  const res = await fetch(`${API_URL}/courses/${state.courseId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${await apiToken(state.assistant)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Зламано' }),
  });
  expect(res.status).toBe(403);
});

test('removing the assistant revokes their access', async ({ page }) => {
  await login(page, USERS.teacher1, `/courses/${state.courseId}/manage?tab=team`);
  const row = page.getByRole('row', { name: new RegExp(state.assistant.email) });
  await row.getByRole('button', { name: `Видалити ${state.assistant.name} з команди` }).click();
  const dialog = page.getByRole('dialog', { name: 'Видалити з команди?' });
  await dialog.getByRole('button', { name: 'Видалити' }).click();
  await expect(page.getByText('Учасника видалено з команди')).toBeVisible();

  const token = await apiToken(state.assistant);
  const res = await fetch(`${API_URL}/courses/${state.courseId}/students/progress`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status).toBe(403);
});
