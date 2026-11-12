import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { api, API_URL, apiToken, failOnPageErrors, login, uid, USERS } from './helpers';

/**
 * Gradebook end to end: a course with one test and one assignment, two
 * students (one did everything, one did nothing). The teacher sees the
 * weighted finals, changes the weights, exports Excel/CSV; a student sees
 * only their own grades.
 */

const PASSWORD = 'demo1234';
type Account = { email: string; password: string; id: number; name: string };

const state: {
  courseId: number;
  courseTitle: string;
  testTitle: string;
  assignmentTitle: string;
  good: Account;
  idle: Account;
} = {} as never;

async function freshStudent(tag: string): Promise<Account> {
  const email = `e2e-gb-${tag}-${uid()}@lms.local`;
  const lastName = `Журнал${tag}`;
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

async function postForm(pathName: string, token: string, form: FormData) {
  const res = await fetch(`${API_URL}${pathName}`, {
    method: 'POST',
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
  state.courseTitle = `E2E журнал ${uid()}`;
  const form = new FormData();
  form.append('title', state.courseTitle);
  form.append('description', 'Курс для перевірки журналу оцінок');
  form.append('price', '0');
  form.append('published', 'true');
  form.append('autoApprove', 'true');
  state.courseId = (await postForm('/courses', teacher, form)).id;

  const section = await api<{ id: number }>(`/sections/${state.courseId}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: 'Модуль оцінювання' }),
  });
  const l1 = await api<{ id: number }>(`/lessons/${section.id}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: 'Теорія', content: '<p>Теорія.</p>' }),
  });
  const l2 = await api<{ id: number }>(`/lessons/${section.id}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: 'Практика', content: '<p>Практика.</p>' }),
  });

  // Test with two single-choice questions.
  state.testTitle = 'Контрольний тест';
  const t = await api<{ id: number }>(`/tests/${l1.id}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: state.testTitle, timeLimit: 10, passingScore: 60 }),
  });
  const correct: Record<string, number[]> = {};
  for (const text of ['Два плюс два?', 'Столиця України?']) {
    const q = await api<{ id: number }>(`/tests/${t.id}/questions`, teacher, {
      method: 'POST',
      body: JSON.stringify({ text, type: 'SINGLE' }),
    });
    const right = await api<{ id: number }>(`/tests/questions/${q.id}/answers`, teacher, {
      method: 'POST',
      body: JSON.stringify({ text: 'Правильно', isCorrect: true }),
    });
    await api(`/tests/questions/${q.id}/answers`, teacher, {
      method: 'POST',
      body: JSON.stringify({ text: 'Неправильно', isCorrect: false }),
    });
    correct[String(q.id)] = [right.id];
  }

  state.assignmentTitle = 'Практична робота';
  const a = await api<{ id: number }>(`/lessons/${l2.id}/assignment`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: state.assignmentTitle, maxScore: 50, maxFiles: 3 }),
  });

  state.good = await freshStudent('A');
  state.idle = await freshStudent('B');
  for (const s of [state.good, state.idle]) {
    await api(`/courses/${state.courseId}/enroll`, await apiToken(s), { method: 'POST' });
  }

  // The good student: 100% on the test, 40/50 for the assignment.
  const goodToken = await apiToken(state.good);
  const attempt = await api<{ testResultId: number }>(`/tests/${t.id}/start`, goodToken, { method: 'POST' });
  await api(`/tests/${attempt.testResultId}/submit`, goodToken, {
    method: 'POST',
    body: JSON.stringify({ answers: correct }),
  });
  const files = new FormData();
  files.append(
    'files',
    new Blob([await readFile(path.join(__dirname, 'fixtures', 'assignment-styles.css'))], { type: 'text/css' }),
    'styles.css',
  );
  await postForm(`/assignments/${a.id}/submission`, goodToken, files);
  const subs = await api<{ id: number; userId?: number; user?: { id: number } }[]>(
    `/assignments/${a.id}/submissions`,
    teacher,
  );
  const sub = subs[0];
  await api(`/submissions/${sub.id}/grade`, teacher, {
    method: 'PATCH',
    body: JSON.stringify({ score: 40, feedback: 'Добре' }),
  });
});

test('teacher sees weighted finals, pass badges and filters', async ({ page }) => {
  await login(page, USERS.teacher1, `/courses/${state.courseId}/manage?tab=gradebook`);
  await expect(page.getByRole('heading', { name: 'Журнал оцінок' })).toBeVisible();

  const good = gradebookRow(page, state.good.name);
  const idle = gradebookRow(page, state.idle.name);
  // 50% × 100 (tests) + 50% × 80 (40 of 50) = 90
  await expect(good).toContainText('100%');
  await expect(good).toContainText('40/50');
  await expect(good).toContainText('90%');
  await expect(good.getByText('Склав', { exact: true })).toBeVisible();
  await expect(idle).toContainText('0%');
  await expect(idle.getByText('Не склав')).toBeVisible();

  await page.getByLabel('Лише ті, хто не склав').check();
  await expect(gradebookRow(page, state.idle.name)).toBeVisible();
  await expect(gradebookRow(page, state.good.name)).toHaveCount(0);
  await page.getByLabel('Лише ті, хто не склав').uncheck();

  await page.getByRole('searchbox').fill('ЖурналA');
  await expect(gradebookRow(page, state.good.name)).toBeVisible();
  await expect(gradebookRow(page, state.idle.name)).toHaveCount(0);
});

test('changing the weights in settings updates the final grade', async ({ page }) => {
  await login(page, USERS.teacher1, `/teacher/courses/${state.courseId}/builder`);
  await page.getByRole('tab', { name: 'Налаштування і ціна' }).click();
  await page.getByLabel('Вага тестів, %').fill('20');
  await expect(page.getByLabel('Вага завдань, %')).toHaveValue('80');
  await page.getByRole('button', { name: 'Зберегти зміни' }).click();
  await expect(page.getByText('Налаштування збережено')).toBeVisible();

  // The API refuses weights that don't add up to 100.
  const teacher = await apiToken(USERS.teacher1);
  const bad = new FormData();
  bad.append('testsWeight', '70');
  bad.append('assignmentsWeight', '70');
  const res = await fetch(`${API_URL}/courses/${state.courseId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${teacher}` },
    body: bad,
  });
  expect(res.status).toBe(400);

  await page.goto(`/courses/${state.courseId}/manage?tab=gradebook`);
  // 20% × 100 + 80% × 80 = 84
  await expect(gradebookRow(page, state.good.name)).toContainText('84%');
});

test('exports the gradebook to Excel and CSV', async ({ page }) => {
  await login(page, USERS.teacher1, `/courses/${state.courseId}/manage?tab=gradebook`);
  await expect(page.getByRole('heading', { name: 'Журнал оцінок' })).toBeVisible();

  const [xlsx] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Експорт Excel' }).click(),
  ]);
  expect(xlsx.suggestedFilename()).toMatch(/^gradebook-.+-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const xlsxBytes = await readFile((await xlsx.path()) as string);
  expect(xlsxBytes.length).toBeGreaterThan(1000);
  expect(xlsxBytes.subarray(0, 2).toString()).toBe('PK');

  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Експорт CSV' }).click(),
  ]);
  expect(csv.suggestedFilename()).toMatch(/^gradebook-.+\.csv$/);
  const text = (await readFile((await csv.path()) as string)).toString('utf8');
  expect(text.charCodeAt(0)).toBe(0xfeff);
  const [header, ...lines] = text.slice(1).trim().split(/\r?\n/);
  expect(header.startsWith('Студент;Email;')).toBe(true);
  expect(header).toContain('Підсумок, %');
  expect(lines.some((l) => l.includes(state.good.email) && l.includes(';84;'))).toBe(true);
});

test('a student sees only their own grades', async ({ page }) => {
  // Students can't open the teacher's gradebook.
  const res = await fetch(`${API_URL}/courses/${state.courseId}/gradebook`, {
    headers: { Authorization: `Bearer ${await apiToken(state.good)}` },
  });
  expect(res.status).toBe(403);

  await login(page, state.good, `/courses/${state.courseId}`);
  await page.getByRole('link', { name: 'Мої оцінки' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/courses/${state.courseId}/grades$`));
  await expect(page.getByRole('heading', { name: 'Мої оцінки' })).toBeVisible();
  await expect(page.getByText('84%').first()).toBeVisible();
  await expect(page.getByText('Курс зараховано')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: state.testTitle })).toContainText('100%');
  await expect(page.getByRole('listitem').filter({ hasText: state.assignmentTitle })).toContainText('40/50');
  await expect(page.getByText(state.idle.email)).toHaveCount(0);
  await expect(page.getByText(state.idle.name)).toHaveCount(0);
});
