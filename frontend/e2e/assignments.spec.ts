import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { api, API_URL, apiToken, failOnPageErrors, login, uid, USERS } from './helpers';

/**
 * Practical assignments end to end: the teacher adds an assignment in the
 * builder, a student hands in files, the teacher grades or returns the work.
 */

const PASSWORD = 'demo1234';
const FIX = (name: string) => path.join(__dirname, 'fixtures', name);
const REPORT = 'assignment-Звіт лабораторної.md';
const ASSIGNMENT_TITLE = 'Лабораторна: сторінка-каталог';

type Account = { email: string; password: string; id: number; name: string };

const state: {
  courseId: number;
  lessonTitle: string;
  assignmentId: number;
  student: Account;
  reviser: Account;
} = {} as never;

async function freshStudent(tag: string): Promise<Account> {
  const email = `e2e-asg-${tag}-${uid()}@lms.local`;
  const lastName = `Тест${tag}`;
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

/** Multipart POST as a given user (course creation, API-level submissions). */
async function postForm(pathName: string, token: string, form: FormData) {
  return fetch(`${API_URL}${pathName}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

async function fileBlob(name: string, type = 'text/plain') {
  return new Blob([await readFile(FIX(name))], { type });
}

async function courseItem(page: Page, name: string | RegExp) {
  await page.getByRole('navigation', { name: 'Зміст курсу' }).getByRole('button', { name }).click();
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(({ page }) => failOnPageErrors(page));

test.beforeAll(async () => {
  const teacher = await apiToken(USERS.teacher1);
  const form = new FormData();
  form.append('title', `E2E завдання ${uid()}`);
  form.append('description', 'Курс для перевірки практичних завдань');
  form.append('price', '0');
  form.append('published', 'true');
  form.append('autoApprove', 'true');
  const res = await postForm('/courses', teacher, form);
  if (!res.ok) throw new Error(`course: ${res.status} ${await res.text()}`);
  state.courseId = ((await res.json()) as { id: number }).id;

  const section = await api<{ id: number }>(`/sections/${state.courseId}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: 'Практика' }),
  });
  state.lessonTitle = 'Сітка каталогу';
  await api(`/lessons/${section.id}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: state.lessonTitle, content: '<p>Матеріал уроку.</p>' }),
  });

  state.student = await freshStudent('A');
  state.reviser = await freshStudent('B');
  for (const s of [state.student, state.reviser]) {
    await api(`/courses/${state.courseId}/enroll`, await apiToken(s), { method: 'POST' });
  }
});

test('teacher adds an assignment to a lesson in the builder', async ({ page }) => {
  await login(page, USERS.teacher1, `/teacher/courses/${state.courseId}/builder`);
  await page.getByRole('button', { name: `Додати завдання до уроку ${state.lessonTitle}` }).click();

  await expect(page.getByText('Практичне завдання', { exact: true })).toBeVisible();
  await page.getByLabel('Назва завдання').fill(ASSIGNMENT_TITLE);
  await page.getByLabel('Опис і вимоги').fill('<p>Зверстайте каталог курсів на <code>grid</code>.</p>');
  const due = new Date(Date.now() + 5 * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  await page
    .getByLabel('Термін здачі')
    .fill(`${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T18:00`);
  await page.getByLabel('Файлів у роботі').fill('2');
  await page.getByRole('button', { name: 'Зберегти завдання' }).click();
  await expect(page.getByText('Завдання збережено')).toBeVisible();
  await expect(page.getByRole('button', { name: `Завдання: ${ASSIGNMENT_TITLE}` })).toBeVisible();

  const teacher = await apiToken(USERS.teacher1);
  const course = await api<{ sections: { lessons: { assignment: { id: number } | null }[] }[] }>(
    `/courses/${state.courseId}`,
    teacher,
  );
  state.assignmentId = course.sections[0].lessons[0].assignment!.id;
  expect(state.assignmentId).toBeGreaterThan(0);
});

test('the API rejects unsupported types and too many files', async () => {
  const token = await apiToken(state.student);
  const html = new FormData();
  html.append('files', await fileBlob('assignment-evil.html', 'text/html'), 'assignment-evil.html');
  const r1 = await postForm(`/assignments/${state.assignmentId}/submission`, token, html);
  expect(r1.status).toBe(400);

  const many = new FormData();
  for (const n of ['assignment-styles.css', 'assignment-card.css', REPORT]) {
    many.append('files', await fileBlob(n), n);
  }
  const r2 = await postForm(`/assignments/${state.assignmentId}/submission`, token, many);
  expect(r2.status).toBe(400);
  expect(await r2.text()).toMatch(/At most 2 files/);
});

test('student hands in files from the course page', async ({ page }) => {
  await login(page, state.student, `/courses/${state.courseId}`);
  await courseItem(page, `Завдання: ${ASSIGNMENT_TITLE}`);
  await expect(page).toHaveURL(new RegExp(`assignment=${state.assignmentId}`));
  await expect(page.getByRole('heading', { level: 1, name: ASSIGNMENT_TITLE })).toBeVisible();
  await expect(page.getByText(/Залишилось \d+ (день|дні|днів)/)).toBeVisible();

  const input = page.getByLabel('Файли роботи');
  // Client-side checks: wrong type and the per-assignment file limit.
  await input.setInputFiles(FIX('assignment-evil.html'));
  await expect(page.getByText(/такий тип файлу не підтримується/)).toBeVisible();
  await input.setInputFiles([FIX('assignment-styles.css'), FIX('assignment-card.css'), FIX(REPORT)]);
  await expect(page.getByText('Можна додати не більше 2 файлів')).toBeVisible();
  const selected = page.getByRole('list', { name: 'Вибрані файли' });
  await expect(selected.getByRole('listitem')).toHaveCount(2);
  await selected.getByRole('button', { name: 'Прибрати assignment-card.css' }).click();
  await input.setInputFiles(FIX(REPORT));
  await expect(selected.getByText(REPORT)).toBeVisible();

  await page.getByLabel('Коментар до роботи').fill('Перевірено на ширині 390 px');
  await page.getByRole('button', { name: 'Здати роботу' }).click();
  await expect(page.getByText('Роботу здано')).toBeVisible();
  await expect(page.getByText('Здано', { exact: true })).toBeVisible();
  // The Cyrillic file name survives the upload.
  await expect(page.getByRole('link', { name: REPORT, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'assignment-styles.css', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Здати повторно' })).toBeVisible();
});

test('teacher grades the work on the Manage page', async ({ page }) => {
  await login(page, USERS.teacher1, `/courses/${state.courseId}/manage?tab=assignments`);
  await expect(page.getByRole('tab', { name: /Завдання/ })).toHaveAttribute('aria-selected', 'true');
  const block = page.getByRole('region', { name: ASSIGNMENT_TITLE });
  const row = block.getByRole('row', { name: new RegExp(state.student.name) });
  await expect(row.getByRole('link', { name: REPORT })).toBeVisible();
  await row.getByRole('button', { name: 'Перевірити' }).click();

  const dialog = page.getByRole('dialog', { name: `Робота: ${state.student.name}` });
  await dialog.getByLabel(/Оцінка/).fill('120');
  await expect(dialog.getByText('Від 0 до 100')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Оцінити' })).toBeDisabled();
  await dialog.getByLabel(/Оцінка/).fill('85');
  await dialog.getByLabel('Коментар для студента').fill('Добре! Додайте відступи на мобільних.');
  await dialog.getByRole('button', { name: 'Оцінити' }).click();
  await expect(page.getByText('Оцінку збережено')).toBeVisible();
  await expect(row.getByText('Перевірено 85/100')).toBeVisible();
});

test('student sees the grade, feedback, progress and a notification', async ({ page }) => {
  await login(page, state.student, `/courses/${state.courseId}?assignment=${state.assignmentId}`);
  await expect(page.getByText('Перевірено 85/100')).toBeVisible();
  await expect(page.getByText('Добре! Додайте відступи на мобільних.')).toBeVisible();
  await expect(page.getByText('Роботу оцінено. Повторно здати її не можна.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Здати/ })).toHaveCount(0);

  const progress = await api<{ progress: { assignments: number[]; completed: number } }>(
    `/courses/${state.courseId}`,
    await apiToken(state.student),
  );
  expect(progress.progress.assignments).toContain(state.assignmentId);
  expect(progress.progress.completed).toBeGreaterThanOrEqual(1);

  await page.goto('/notifications');
  await expect(page.getByText(`Роботу «${ASSIGNMENT_TITLE}» перевірено: 85/100`)).toBeVisible();
});

test('returned work can be revised and handed in again', async ({ page, browser }) => {
  const token = await apiToken(state.reviser);
  const form = new FormData();
  form.append('files', await fileBlob('assignment-styles.css', 'text/css'), 'assignment-styles.css');
  const res = await postForm(`/assignments/${state.assignmentId}/submission`, token, form);
  expect(res.ok).toBe(true);

  await login(page, USERS.teacher1, `/courses/${state.courseId}/manage?tab=assignments`);
  const row = page
    .getByRole('region', { name: ASSIGNMENT_TITLE })
    .getByRole('row', { name: new RegExp(state.reviser.name) });
  await row.getByRole('button', { name: 'Перевірити' }).click();
  const dialog = page.getByRole('dialog', { name: `Робота: ${state.reviser.name}` });
  await expect(dialog.getByRole('button', { name: 'Повернути на доопрацювання' })).toBeDisabled();
  await dialog.getByLabel('Коментар для студента').fill('Бракує звіту — додайте його.');
  await dialog.getByRole('button', { name: 'Повернути на доопрацювання' }).click();
  await expect(page.getByText('Роботу повернуто на доопрацювання')).toBeVisible();

  // The student works in a separate browser session.
  const ctx = await browser.newContext();
  const sp = await ctx.newPage();
  failOnPageErrors(sp);
  await login(sp, state.reviser, `/courses/${state.courseId}?assignment=${state.assignmentId}`);
  await expect(sp.getByText('Повернуто на доопрацювання')).toBeVisible();
  await expect(sp.getByText('Бракує звіту — додайте його.')).toBeVisible();
  await sp.getByLabel('Файли роботи').setInputFiles([FIX('assignment-styles.css'), FIX(REPORT)]);
  await sp.getByRole('button', { name: 'Здати повторно' }).click();
  await expect(sp.getByText('Роботу здано повторно')).toBeVisible();
  await expect(sp.getByText('Здано', { exact: true })).toBeVisible();
  await expect(sp.getByRole('link', { name: REPORT, exact: true })).toBeVisible();
  await ctx.close();
});
