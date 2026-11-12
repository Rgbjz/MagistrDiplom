import { expect, test } from '@playwright/test';
import { api, API_URL, apiToken, failOnPageErrors, login, uid, USERS } from './helpers';

/**
 * Calendar end to end: a teacher adds a course event, the student sees it and
 * the assignment deadline (month + list view), the personal iCal feed carries
 * both, and a deadline reminder reaches the student.
 */

const PASSWORD = 'demo1234';
const ASSIGNMENT = `Есе про REST ${uid()}`;
const EVENT = `Лекція: REST API ${uid()}`;

type Account = { email: string; password: string; id: number };

const state: {
  courseId: number;
  courseTitle: string;
  assignmentId: number;
  eventDay: string;
  dueDay: string;
  student: Account;
} = {} as never;

/** YYYY-MM-DD of now + days in Kyiv time (the calendar's zone). */
function kyivDay(days: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(
    new Date(Date.now() + days * 86_400_000),
  );
}

async function freshStudent(): Promise<Account> {
  const email = `e2e-cal-${uid()}@lms.local`;
  const reg = await api<{ confirmToken?: string }>('/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD, role: 'STUDENT', firstName: 'Календар', lastName: 'Тест' }),
  });
  if (!reg.confirmToken) throw new Error('No confirmToken: backend must run without SMTP');
  await api('/auth/confirm', undefined, { method: 'POST', body: JSON.stringify({ token: reg.confirmToken }) });
  const user = { email, password: PASSWORD };
  const me = await api<{ id: number }>('/users/me', await apiToken(user));
  return { ...user, id: me.id };
}

test.describe.configure({ mode: 'serial' });
test.use({ timezoneId: 'Europe/Kyiv' });
test.beforeEach(({ page }) => failOnPageErrors(page));

test.beforeAll(async () => {
  const teacher = await apiToken(USERS.teacher1);
  state.courseTitle = `E2E календар ${uid()}`;
  const form = new FormData();
  form.append('title', state.courseTitle);
  form.append('description', 'Курс для перевірки календаря');
  form.append('price', '0');
  form.append('published', 'true');
  form.append('autoApprove', 'true');
  const res = await fetch(`${API_URL}/courses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${teacher}` },
    body: form,
  });
  if (!res.ok) throw new Error(`course: ${res.status} ${await res.text()}`);
  state.courseId = ((await res.json()) as { id: number }).id;

  const section = await api<{ id: number }>(`/sections/${state.courseId}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: 'Тиждень 1' }),
  });
  const lesson = await api<{ id: number }>(`/lessons/${section.id}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: 'REST', content: '<p>Матеріал.</p>' }),
  });
  state.dueDay = kyivDay(3);
  const assignment = await api<{ id: number }>(`/lessons/${lesson.id}/assignment`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: ASSIGNMENT, dueAt: `${state.dueDay}T13:00:00Z`, maxScore: 100 }),
  });
  state.assignmentId = assignment.id;
  state.eventDay = kyivDay(2);

  state.student = await freshStudent();
  await api(`/courses/${state.courseId}/enroll`, await apiToken(state.student), { method: 'POST' });
});

test('teacher adds a course event from the calendar', async ({ page }) => {
  await login(page, USERS.teacher1, '/calendar');
  await expect(page.getByRole('heading', { level: 1, name: 'Календар' })).toBeVisible();
  // the today cell is marked for assistive tech
  await expect(page.locator('button[aria-current="date"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Додати подію' }).click();

  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: 'Нова подія' })).toBeVisible();
  await dialog.getByLabel('Курс').selectOption({ label: state.courseTitle });
  await dialog.getByLabel('Назва').fill(EVENT);
  await dialog.getByRole('combobox', { name: 'Тип', exact: true }).selectOption({ label: 'Лекція' });
  await dialog.getByLabel('Початок').fill(`${state.eventDay}T10:00`);
  await dialog.getByLabel('Кінець (необов’язково)').fill(`${state.eventDay}T11:30`);
  await dialog.getByRole('button', { name: 'Додати', exact: true }).click();
  await expect(page.getByText('Подію додано')).toBeVisible();

  await page.goto(`/calendar?view=agenda&course=${state.courseId}`);
  const item = page.locator('li').filter({ hasText: EVENT });
  await expect(item).toBeVisible();
  await expect(item.getByText('Лекція', { exact: true })).toBeVisible();
  await expect(item.getByRole('button', { name: `Редагувати: ${EVENT}` })).toBeVisible();
});

test('student sees the event and the deadline in month and list views', async ({ page }) => {
  await login(page, state.student, `/calendar?date=${state.eventDay}`);
  // the selected day panel lists the lecture; the student can't edit it
  const panel = page.locator('section', { has: page.getByRole('heading', { name: /Події на/ }) });
  await expect(panel.getByRole('link', { name: EVENT })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Редагувати/ })).toHaveCount(0);

  // clicking the deadline's day cell switches the panel
  await page.goto(`/calendar?date=${state.dueDay}`);
  const deadline = page.locator('li').filter({ hasText: ASSIGNMENT });
  await expect(deadline.getByText('Дедлайн завдання')).toBeVisible();
  await expect(deadline.getByText('Не здано')).toBeVisible();
  await expect(deadline.getByRole('link', { name: ASSIGNMENT })).toHaveAttribute(
    'href',
    `/courses/${state.courseId}?assignment=${state.assignmentId}`,
  );

  // list view shows both, in date order
  await page.getByRole('button', { name: 'Список' }).click();
  await expect(page).toHaveURL(/view=agenda/);
  const titles = await page.locator('li a').allTextContents();
  const ev = titles.indexOf(EVENT);
  const asg = titles.indexOf(ASSIGNMENT);
  expect(ev).toBeGreaterThanOrEqual(0);
  expect(asg).toBeGreaterThan(ev);
});

test('personal iCal feed contains the items and can be revoked', async ({ page, request }) => {
  await login(page, state.student, '/calendar');
  await page.getByRole('button', { name: 'Підписатися в Google Calendar' }).click();
  const input = page.getByTestId('ical-url');
  await expect(input).toHaveValue(/\/calendar\/ical\/.+\.ics$/);
  const url = await input.inputValue();

  const res = await request.get(url);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/calendar');
  const body = await res.text();
  expect(body).toContain('BEGIN:VCALENDAR');
  expect(body).toContain(`UID:assignment-${state.assignmentId}@lms`);
  expect(body.replace(/\r\n /g, '')).toContain(EVENT.replace(/,/g, '\\,'));

  // reset → the old URL stops working, a new one is shown
  const resetButtons = page.getByRole('button', { name: 'Створити нове посилання' });
  await resetButtons.first().click();
  await resetButtons.last().click(); // confirm dialog
  await expect(page.getByText('Створено нове посилання')).toBeVisible();
  await expect(input).not.toHaveValue(url);
  expect((await request.get(url)).status()).toBe(404);
  expect((await request.get(await input.inputValue())).status()).toBe(200);
});

test('deadline reminder reaches the student (and respects the opt-out)', async ({ page }) => {
  const teacher = await apiToken(USERS.teacher1);
  const sent = await api<{ notified: number }>('/calendar/dev/remind', teacher, {
    method: 'POST',
    body: JSON.stringify({ kind: 'assignment', id: state.assignmentId }),
  });
  expect(sent.notified).toBeGreaterThanOrEqual(1);

  await login(page, state.student, '/notifications');
  await expect(
    page.getByText(`Дедлайн завдання «${ASSIGNMENT}» — через годину`),
  ).toBeVisible();

  // switch reminders off in the profile → no new reminder for this student
  await page.goto('/profile#settings');
  const toggle = page.getByLabel(/Нагадувати за 24 години/);
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(page.getByText('Налаштування збережено')).toBeVisible();
  await expect(toggle).not.toBeChecked();

  const before = await api<unknown[]>('/notifications', await apiToken(state.student));
  await api('/calendar/dev/remind', teacher, {
    method: 'POST',
    body: JSON.stringify({ kind: 'assignment', id: state.assignmentId }),
  });
  const after = await api<unknown[]>('/notifications', await apiToken(state.student));
  expect(after.length).toBe(before.length);
});

test('students cannot trigger reminders or add events', async () => {
  const token = await apiToken(state.student);
  const remind = await fetch(`${API_URL}/calendar/dev/remind`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'assignment', id: state.assignmentId }),
  });
  expect(remind.status).toBe(403);
  const create = await fetch(`${API_URL}/courses/${state.courseId}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'X', startsAt: new Date().toISOString() }),
  });
  expect(create.status).toBe(403);
});
