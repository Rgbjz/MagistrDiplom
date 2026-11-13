import { expect, test } from '@playwright/test';
import { api, API_URL, apiToken, failOnPageErrors, login, uid, USERS } from './helpers';

/**
 * Adaptation module end to end: learner model after a poor test result,
 * personal recommendations (course panel + dashboard), adaptive question
 * selection by ability, and the teacher's adaptation tab with an A/B
 * experiment.
 */

type Account = { email: string; password: string; id: number; name: string };

const state: {
  courseId: number;
  courseTitle: string;
  testId: number;
  level: Map<number, number>;
  correct: Record<string, number[]>;
  weak: Account;
  strong: Account;
} = {} as never;

test.describe.configure({ mode: 'serial' });

// Logins are rate limited (10/min per IP): reuse one token per account.
const tokens = new Map<string, Promise<string>>();
const tokenOf = (user: { email: string; password: string }) => {
  if (!tokens.has(user.email)) tokens.set(user.email, apiToken(user));
  return tokens.get(user.email)!;
};

async function freshStudent(tag: string, slug: string): Promise<Account> {
  const email = `e2e-adapt-${slug}-${uid()}@lms.local`;
  const password = 'demo1234';
  const reg = await api<{ confirmToken?: string }>('/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password, role: 'STUDENT', firstName: 'Адапт', lastName: tag }),
  });
  await api('/auth/confirm', undefined, { method: 'POST', body: JSON.stringify({ token: reg.confirmToken }) });
  const me = await api<{ id: number }>('/users/me', await tokenOf({ email, password }));
  return { email, password, id: me.id, name: `Адапт ${tag}` };
}

async function attempt(student: Account, mode: 'right' | 'wrong') {
  const token = await tokenOf(student);
  const start = await api<{ testResultId: number; questions: { id: number }[] }>(
    `/tests/${state.testId}/start`,
    token,
    { method: 'POST' },
  );
  const answers =
    mode === 'right'
      ? Object.fromEntries(start.questions.map((q) => [String(q.id), state.correct[String(q.id)]]))
      : {};
  await api(`/tests/${start.testResultId}/submit`, token, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
  return start.questions.map((q) => q.id);
}

const meanLevel = (ids: number[]) => ids.reduce((s, id) => s + state.level.get(id)!, 0) / ids.length;

test.beforeEach(({ page }) => failOnPageErrors(page));

test.beforeAll(async () => {
  const teacher = await tokenOf(USERS.teacher1);
  state.courseTitle = `E2E адаптація ${uid()}`;
  const form = new FormData();
  form.append('title', state.courseTitle);
  form.append('description', 'Курс для перевірки модуля адаптації');
  form.append('price', '0');
  form.append('published', 'true');
  form.append('autoApprove', 'true');
  const res = await fetch(`${API_URL}/courses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${teacher}` },
    body: form,
  });
  state.courseId = ((await res.json()) as { id: number }).id;

  const s1 = await api<{ id: number }>(`/sections/${state.courseId}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: 'HTML основи' }),
  });
  const s2 = await api<{ id: number }>(`/sections/${state.courseId}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: 'CSS основи' }),
  });
  const l1 = await api<{ id: number }>(`/lessons/${s1.id}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: 'Теги й атрибути', content: '<p>Теорія.</p>' }),
  });
  await api(`/lessons/${s2.id}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: 'Селектори', content: '<p>Теорія.</p>' }),
  });

  // Six questions: two per difficulty level; an attempt draws three of them.
  const t = await api<{ id: number }>(`/tests/${l1.id}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: 'Тест HTML', timeLimit: 10, passingScore: 60 }),
  });
  state.testId = t.id;
  state.level = new Map();
  state.correct = {};
  for (const [i, level] of [1, 1, 2, 2, 3, 3].entries()) {
    const q = await api<{ id: number }>(`/tests/${t.id}/questions`, teacher, {
      method: 'POST',
      body: JSON.stringify({ text: `Питання ${i + 1} (рівень ${level})`, type: 'SINGLE', difficulty: level }),
    });
    const right = await api<{ id: number }>(`/tests/questions/${q.id}/answers`, teacher, {
      method: 'POST',
      body: JSON.stringify({ text: 'Правильно', isCorrect: true }),
    });
    await api(`/tests/questions/${q.id}/answers`, teacher, {
      method: 'POST',
      body: JSON.stringify({ text: 'Неправильно', isCorrect: false }),
    });
    state.level.set(q.id, level);
    state.correct[String(q.id)] = [right.id];
  }
  await api(`/tests/${t.id}`, teacher, {
    method: 'PATCH',
    body: JSON.stringify({ adaptive: true, questionsPerAttempt: 3 }),
  });

  state.weak = await freshStudent('Слабкий', 'weak');
  state.strong = await freshStudent('Сильний', 'strong');
  for (const s of [state.weak, state.strong]) {
    await api(`/courses/${state.courseId}/enroll`, await tokenOf(s), { method: 'POST' });
  }
});

test('adaptive attempts: a strong student gets harder questions than a weak one', async () => {
  await attempt(state.weak, 'wrong');
  await attempt(state.strong, 'right');
  const weakNext = await attempt(state.weak, 'wrong');
  const strongNext = await attempt(state.strong, 'right');
  expect(weakNext).toHaveLength(3);
  expect(strongNext).toHaveLength(3);
  expect(meanLevel(strongNext)).toBeGreaterThan(meanLevel(weakNext));
  // The hardest questions go to the strong student only.
  expect(weakNext.some((id) => state.level.get(id) === 3)).toBe(false);
});

test('a student with a poor result sees the weak topic and a review recommendation', async ({ page }) => {
  await login(page, state.weak, `/courses/${state.courseId}`);
  const panel = page.getByRole('region', { name: 'Ваш прогрес по темах' });
  await expect(panel).toBeVisible();
  const bar = panel.getByRole('listitem', { name: /^HTML основи: \d+% — потребує повторення$/ });
  await expect(bar).toBeVisible();
  await expect(panel.getByRole('listitem', { name: /^CSS основи: 50% — ще немає даних$/ })).toBeVisible();

  const review = panel.getByRole('link', { name: /Повторення.*Тема «HTML основи» засвоєна на \d+%/ });
  await expect(review).toBeVisible();
  await review.click();
  await expect(page).toHaveURL(/\?lesson=\d+/);
  await expect(page.getByRole('heading', { name: 'Теги й атрибути' })).toBeVisible();

  // The same advice on the dashboard, across courses.
  await page.goto('/');
  const dash = page.getByRole('region', { name: 'Рекомендовано для вас' });
  await expect(dash).toBeVisible();
  await expect(dash.getByText(`Курс «${state.courseTitle}»`).first()).toBeVisible();

  // The click was logged for the effectiveness study.
  const overview = await api<{ recommendations: { shown: number; opened: number } }>(
    `/courses/${state.courseId}/adaptive/overview`,
    await tokenOf(USERS.teacher1),
  );
  expect(overview.recommendations.shown).toBeGreaterThan(0);
  expect(overview.recommendations.opened).toBeGreaterThan(0);
});

test('teacher sees the mastery heatmap and runs an A/B experiment', async ({ page }) => {
  await login(page, USERS.teacher1, `/courses/${state.courseId}/manage?tab=adaptive`);
  await expect(page.getByRole('heading', { name: 'Адаптивне навчання' })).toBeVisible();
  const heatmap = page.getByRole('region', { name: 'Засвоєння тем студентами' });
  const weakRow = heatmap.getByRole('row', { name: new RegExp(state.weak.name) });
  await expect(weakRow).toContainText('потребує повторення');
  await expect(heatmap.getByRole('columnheader', { name: 'HTML основи' })).toBeVisible();

  await page.getByRole('button', { name: 'A/B', exact: true }).click();
  await page.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByText('Налаштування збережено')).toBeVisible();
  await expect(page.getByText(/Групи: адаптивна — 1, контрольна — 1/)).toBeVisible();

  // Server-side gating: the control student gets no recommendations.
  const groups = await Promise.all(
    [state.weak, state.strong].map(async (s) =>
      api<{ group: string; adaptive: boolean; recommendations: unknown[] }>(
        `/courses/${state.courseId}/adaptive/me`,
        await tokenOf(s),
      ),
    ),
  );
  const control = groups.find((g) => g.group === 'CONTROL')!;
  expect(control.adaptive).toBe(false);
  expect(control.recommendations).toEqual([]);
  expect(groups.find((g) => g.group === 'ADAPTIVE')!.adaptive).toBe(true);

  // CSV for the experiment: one anonymised row per student with the arm.
  const res = await fetch(`${API_URL}/courses/${state.courseId}/adaptive/experiment/export`, {
    headers: { Authorization: `Bearer ${await tokenOf(USERS.teacher1)}` },
  });
  const csv = (await res.text()).replace(/^﻿/, '');
  const lines = csv.trim().split(/\r?\n/);
  expect(lines[0]).toContain('group,pre_score,post_score');
  expect(lines.slice(1).map((l) => l.split(',')[1]).sort()).toEqual(['ADAPTIVE', 'CONTROL']);
});
