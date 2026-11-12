import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { api, API_URL, apiToken, failOnPageErrors, login, uid, USERS } from './helpers';

/**
 * Manual grade changes and grading scales: the teacher overrides an
 * assignment cell and the final grade with a reason, the student sees the
 * new value with the reason and gets a notification, a reset restores the
 * computed value, an ECTS scale shows letters (also in the exports), and an
 * assistant may override while a student may not.
 */

const PASSWORD = 'demo1234';
type Account = { email: string; password: string; id: number; name: string };

const state: {
  courseId: number;
  assignmentTitle: string;
  student: Account;
} = {} as never;

async function freshStudent(): Promise<Account> {
  const email = `e2e-ov-${uid()}@lms.local`;
  const lastName = `Корекція${uid().slice(-4)}`;
  const reg = await api<{ confirmToken?: string }>('/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD, role: 'STUDENT', firstName: 'Студент', lastName }),
  });
  if (!reg.confirmToken) throw new Error('No confirmToken: backend must run without SMTP');
  await api('/auth/confirm', undefined, { method: 'POST', body: JSON.stringify({ token: reg.confirmToken }) });
  const user = { email, password: PASSWORD };
  const me = await api<{ id: number }>('/users/me', await apiToken(user));
  return { ...user, id: me.id, name: `Студент ${lastName}` };
}

async function sendForm(pathName: string, token: string, form: FormData, method = 'POST') {
  const res = await fetch(`${API_URL}${pathName}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`${pathName}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ id: number }>;
}

function gradebookRow(page: Page, name: string) {
  return page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: new RegExp(name) }) });
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(({ page }) => failOnPageErrors(page));

test.beforeAll(async () => {
  const teacher = await apiToken(USERS.teacher1);
  const form = new FormData();
  form.append('title', `E2E корекція ${uid()}`);
  form.append('description', 'Курс для перевірки ручних змін оцінок');
  form.append('price', '0');
  form.append('published', 'true');
  form.append('autoApprove', 'true');
  state.courseId = (await sendForm('/courses', teacher, form)).id;

  const section = await api<{ id: number }>(`/sections/${state.courseId}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: 'Модуль' }),
  });
  const lesson = await api<{ id: number }>(`/lessons/${section.id}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: 'Практика', content: '<p>Практика.</p>' }),
  });
  state.assignmentTitle = 'Лабораторна робота';
  const a = await api<{ id: number }>(`/lessons/${lesson.id}/assignment`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: state.assignmentTitle, maxScore: 50, maxFiles: 3 }),
  });

  state.student = await freshStudent();
  const token = await apiToken(state.student);
  await api(`/courses/${state.courseId}/enroll`, token, { method: 'POST' });
  const files = new FormData();
  files.append(
    'files',
    new Blob([await readFile(path.join(__dirname, 'fixtures', 'assignment-styles.css'))], { type: 'text/css' }),
    'styles.css',
  );
  await sendForm(`/assignments/${a.id}/submission`, token, files);
  const [sub] = await api<{ id: number }[]>(`/assignments/${a.id}/submissions`, teacher);
  // 30/50 → only assignments are graded, so the final is 60%.
  await api(`/submissions/${sub.id}/grade`, teacher, {
    method: 'PATCH',
    body: JSON.stringify({ score: 30, feedback: 'Є недоліки' }),
  });
});

test('teacher overrides an assignment cell and the final grade', async ({ page }) => {
  await login(page, USERS.teacher1, `/courses/${state.courseId}/manage?tab=gradebook`);
  const row = gradebookRow(page, state.student.name);
  await expect(row).toContainText('30/50');
  await expect(row).toContainText('60%');

  await row.getByRole('button', { name: `Змінити оцінку: ${state.student.name}, ${state.assignmentTitle}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Змінити оцінку' });
  await expect(dialog).toBeVisible();
  // Reason is required.
  await dialog.getByLabel('Нова оцінка').fill('45');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog.getByText('Вкажіть причину (щонайменше 5 символів)')).toBeVisible();
  await dialog.getByLabel('Причина зміни').fill('Перездача на консультації');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByText('Оцінку змінено', { exact: true })).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('45/50');
  await expect(row).toContainText('90%');
  await expect(row.getByText('змінено вручну').first()).toBeAttached();

  await row.getByRole('button', { name: `Змінити оцінку: ${state.student.name}, Підсумкова оцінка` }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Нова оцінка').fill('95');
  await dialog.getByLabel('Причина зміни').fill('Активна участь у семінарах');
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('95%');

  // History is kept per item.
  await row.getByRole('button', { name: `Змінити оцінку: ${state.student.name}, Підсумкова оцінка` }).click();
  await expect(dialog.getByText('Активна участь у семінарах').last()).toBeVisible();
  await expect(dialog.getByText('90% → 95%')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('the student sees the new grade, the reason and a notification', async ({ page }) => {
  await login(page, state.student, `/courses/${state.courseId}/grades`);
  await expect(page.getByRole('heading', { name: 'Мої оцінки' })).toBeVisible();
  await expect(page.getByText('95%').first()).toBeVisible();
  await expect(page.getByText('Оцінку змінено вручну. Причина: Активна участь у семінарах')).toBeVisible();
  await expect(page.getByText('Автоматично було: 90%')).toBeVisible();
  const item = page.getByRole('listitem').filter({ hasText: state.assignmentTitle });
  await expect(item).toContainText('45/50');
  await expect(item).toContainText('Причина: Перездача на консультації');

  await page.goto('/notifications');
  await expect(page.getByText(`Оцінку за «${state.assignmentTitle}» змінено`).first()).toBeVisible();
});

test('reset restores the computed value', async ({ page }) => {
  await login(page, USERS.teacher1, `/courses/${state.courseId}/manage?tab=gradebook`);
  const row = gradebookRow(page, state.student.name);
  await row.getByRole('button', { name: `Змінити оцінку: ${state.student.name}, Підсумкова оцінка` }).click();
  const dialog = page.getByRole('dialog', { name: 'Змінити оцінку' });
  await dialog.getByRole('button', { name: 'Скинути до автоматичної' }).click();
  await expect(page.getByText('Оцінку повернуто до автоматичної')).toBeVisible();
  await expect(row).toContainText('90%');
  await expect(row).not.toContainText('95%');
});

test('ECTS scale shows letters in the gradebook, for the student and in exports', async ({ page }) => {
  await login(page, USERS.teacher1, `/teacher/courses/${state.courseId}/builder`);
  await page.getByRole('tab', { name: 'Налаштування і ціна' }).click();
  await page.getByLabel('Шкала оцінювання').selectOption('ECTS');
  await expect(page.getByRole('group', { name: 'Межі оцінок' })).toBeVisible();
  await page.getByRole('button', { name: 'Зберегти зміни' }).click();
  await expect(page.getByText('Налаштування збережено')).toBeVisible();

  await page.goto(`/courses/${state.courseId}/manage?tab=gradebook`);
  const row = gradebookRow(page, state.student.name);
  // 90% → A
  await expect(row.getByRole('cell', { name: 'A', exact: true })).toBeVisible();

  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Експорт CSV' }).click(),
  ]);
  const text = (await readFile((await csv.path()) as string)).toString('utf8');
  const [header, ...lines] = text.slice(1).trim().split(/\r?\n/);
  expect(header).toContain('Оцінка за шкалою');
  const line = lines.find((l) => l.includes(state.student.email)) ?? '';
  expect(line).toContain('45*');
  expect(line).toContain(';A;');
  expect(text).toContain('* — оцінку змінено вручну');

  const [xlsx] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Експорт Excel' }).click(),
  ]);
  const bytes = await readFile((await xlsx.path()) as string);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');

  // Custom thresholds are validated by the API.
  const teacher = await apiToken(USERS.teacher1);
  const bad = new FormData();
  bad.append('gradingScale', 'ECTS');
  bad.append('gradingScaleConfig', JSON.stringify([{ code: 'A', min: 10 }]));
  const res = await fetch(`${API_URL}/courses/${state.courseId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${teacher}` },
    body: bad,
  });
  expect(res.status).toBe(400);

  await page.context().clearCookies();
  await login(page, state.student, `/courses/${state.courseId}/grades`);
  await expect(page.getByText('Оцінка за шкалою')).toBeVisible();
  await expect(page.getByText('A', { exact: true })).toBeVisible();
});

test('an assistant can override, a student cannot', async () => {
  const teacher = await apiToken(USERS.teacher1);
  await api(`/courses/${state.courseId}/staff`, teacher, {
    method: 'POST',
    body: JSON.stringify({ email: USERS.teacher2.email, role: 'ASSISTANT' }),
  });
  const assistant = await apiToken(USERS.teacher2);
  const row = await api<{ final: number; finalOverridden?: { reason: string } }>(
    `/courses/${state.courseId}/gradebook/overrides`,
    assistant,
    {
      method: 'PUT',
      body: JSON.stringify({ userId: state.student.id, itemKey: 'final', value: 70, reason: 'Рішення асистента' }),
    },
  );
  expect(row.final).toBe(70);
  expect(row.finalOverridden?.reason).toBe('Рішення асистента');

  const forbidden = await fetch(`${API_URL}/courses/${state.courseId}/gradebook/overrides`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await apiToken(state.student)}` },
    body: JSON.stringify({ userId: state.student.id, itemKey: 'final', value: 100, reason: 'Хочу 100 балів' }),
  });
  expect(forbidden.status).toBe(403);

  const history = await api<{ itemKey: string }[]>(
    `/courses/${state.courseId}/gradebook/overrides/history?userId=${state.student.id}`,
    teacher,
  );
  expect(history.filter((h) => h.itemKey === 'final').length).toBe(3);
});
