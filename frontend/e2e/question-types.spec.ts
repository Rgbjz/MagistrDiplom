import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { api, API_URL, apiToken, failOnPageErrors, login, uid, USERS } from './helpers';

/**
 * Question types and the question bank end to end: the teacher builds a test
 * with short-text, numeric, matching, ordering and essay questions in the
 * builder; a student takes it (the essay leaves it «На перевірці»); the
 * teacher grades the essay in Manage; the student sees the final score.
 * Finally a small GIFT file is imported into the course bank.
 */

const PASSWORD = 'demo1234';
const LESSON = 'Типи питань';
const ORDER = ['Підключення', 'Запит', 'Обробка результату'];

const state: {
  courseId: number;
  testId: number;
  student: { email: string; password: string };
} = {} as never;

async function freshStudent() {
  const email = `e2e-qt-${uid()}@lms.local`;
  const reg = await api<{ confirmToken?: string }>('/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD, role: 'STUDENT', firstName: 'Студент', lastName: 'Типів' }),
  });
  if (!reg.confirmToken) throw new Error('No confirmToken: backend must run without SMTP');
  await api('/auth/confirm', undefined, { method: 'POST', body: JSON.stringify({ token: reg.confirmToken }) });
  return { email, password: PASSWORD };
}

function card(editor: Locator, page: Page, n: number) {
  return editor.locator('li').filter({ has: page.getByLabel(`Текст питання ${n}`) });
}

async function addQuestion(page: Page, editor: Locator, n: number, type: string, text: string) {
  await editor.getByRole('button', { name: 'Додати питання', exact: true }).click();
  const q = editor.getByLabel(`Текст питання ${n}`);
  await expect(q).toBeVisible();
  await q.fill(text);
  await q.blur();
  const c = card(editor, page, n);
  await c.getByLabel(`Тип питання ${n}`).selectOption(type);
  return c;
}

test.describe.configure({ mode: 'serial' });

test.beforeEach(({ page }) => failOnPageErrors(page));

test.beforeAll(async () => {
  const teacher = await apiToken(USERS.teacher1);
  const form = new FormData();
  // No «тип» in the title: other specs look up selects by the label «Тип».
  form.append('title', `E2E питання ${uid()}`);
  form.append('description', 'Курс для перевірки типів питань');
  form.append('price', '0');
  form.append('published', 'true');
  form.append('autoApprove', 'true');
  const res = await fetch(`${API_URL}/courses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${teacher}` },
    body: form,
  });
  state.courseId = ((await res.json()) as { id: number }).id;
  const section = await api<{ id: number }>(`/sections/${state.courseId}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: 'Модуль' }),
  });
  await api(`/lessons/${section.id}`, teacher, {
    method: 'POST',
    body: JSON.stringify({ title: LESSON, content: '<p>Урок.</p>' }),
  });
  state.student = await freshStudent();
  await api(`/courses/${state.courseId}/enroll`, await apiToken(state.student), { method: 'POST' });
});

test.afterAll(async () => {
  if (state.courseId) {
    await api(`/courses/${state.courseId}`, await apiToken(USERS.teacher1), { method: 'DELETE' });
  }
});

test('teacher builds short-text, numeric, matching, ordering and essay questions', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, USERS.teacher1, `/teacher/courses/${state.courseId}/builder`);
  await page.getByRole('button', { name: `Додати тест до уроку ${LESSON}` }).click();
  const editor = page.getByRole('region', { name: 'Редактор тесту' });
  await expect(editor).toBeVisible();

  const q1 = await addQuestion(page, editor, 1, 'SHORT_TEXT', 'Яка SQL-команда вибирає дані?');
  const accepted = q1.getByLabel('Нова прийнятна відповідь для питання 1');
  await accepted.fill('SELECT');
  await accepted.press('Enter');
  await expect(q1.getByRole('button', { name: 'Прибрати відповідь «SELECT»' })).toBeVisible();

  const q2 = await addQuestion(page, editor, 2, 'NUMERIC', 'Чому дорівнює π (з точністю 0,01)?');
  await q2.getByLabel('Правильне значення (питання 2)').fill('3.14');
  await q2.getByLabel('Правильне значення (питання 2)').blur();
  await q2.getByLabel('Допустима похибка (питання 2)').fill('0,01');
  await q2.getByLabel('Допустима похибка (питання 2)').blur();

  const q3 = await addQuestion(page, editor, 3, 'MATCHING', 'Зіставте технологію і призначення');
  for (const [n, left, right] of [
    [1, 'HTML', 'розмітка'],
    [2, 'CSS', 'стилі'],
  ] as const) {
    await q3.getByRole('button', { name: 'Додати пару' }).click();
    await q3.getByLabel(`Пара ${n}: ліворуч`).fill(left);
    await q3.getByLabel(`Пара ${n}: праворуч`).fill(right);
    await q3.getByLabel(`Пара ${n}: праворуч`).blur();
  }
  await expect(q3.getByText('Потрібно щонайменше 2 заповнені пари.')).toHaveCount(0);

  const q4 = await addQuestion(page, editor, 4, 'ORDERING', 'Розставте кроки роботи з БД');
  for (const [i, item] of ORDER.entries()) {
    await q4.getByRole('button', { name: 'Додати елемент' }).click();
    await q4.getByLabel(`Елемент ${i + 1}`, { exact: true }).fill(item);
    await q4.getByLabel(`Елемент ${i + 1}`, { exact: true }).blur();
  }

  const q5 = await addQuestion(page, editor, 5, 'ESSAY', 'Поясніть, навіщо потрібні індекси');
  await expect(q5.getByLabel('Критерії оцінювання (бачать перевіряючі)')).toBeVisible();
  await q5.getByLabel('Критерії оцінювання (бачать перевіряючі)').fill('Згадати пошук і вартість запису');
  await q5.getByLabel('Критерії оцінювання (бачать перевіряючі)').blur();
  await q5.getByLabel('Бали за питання 5').fill('2');
  await q5.getByLabel('Бали за питання 5').blur();

  // Everything reached the server with the right configs.
  const teacher = await apiToken(USERS.teacher1);
  const course = await api<{ sections: { lessons: { title: string; test?: { id: number } | null }[] }[] }>(
    `/courses/${state.courseId}`,
    teacher,
  );
  state.testId = course.sections[0].lessons.find((l) => l.title === LESSON)!.test!.id;
  await expect
    .poll(async () => {
      const t = await api<{ questions: { type: string; points: number; config: unknown }[] }>(
        `/tests/${state.testId}`,
        teacher,
      );
      return t.questions.map((q) => [q.type, q.points, q.config]);
    })
    .toEqual([
      ['SHORT_TEXT', 1, { accepted: ['SELECT'], caseSensitive: false }],
      ['NUMERIC', 1, { value: 3.14, tolerance: 0.01 }],
      ['MATCHING', 1, { pairs: [{ left: 'HTML', right: 'розмітка' }, { left: 'CSS', right: 'стилі' }] }],
      ['ORDERING', 1, { items: ORDER }],
      ['ESSAY', 2, { maxWords: null, rubric: 'Згадати пошук і вартість запису' }],
    ]);
});

test('student answers every type; the essay waits for review', async ({ page }) => {
  await login(page, state.student, `/courses/${state.courseId}?test=${state.testId}`);
  await page.getByRole('button', { name: 'Почати тест' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  const next = page.getByRole('button', { name: /^Наступне/ });

  await expect(page.getByText('Коротка відповідь', { exact: true })).toBeVisible();
  await page.getByLabel('Ваша відповідь', { exact: true }).fill('  select ');
  await next.click();

  await page.getByLabel('Ваша відповідь (число)').fill('3,141');
  await next.click();

  await page.getByLabel('HTML', { exact: true }).selectOption({ label: 'розмітка' });
  await page.getByLabel('CSS', { exact: true }).selectOption({ label: 'стилі' });
  await next.click();

  // Items arrive shuffled: move each one up into place with the arrow buttons.
  const list = page.getByRole('list', { name: 'Елементи для впорядкування' });
  for (const [target, item] of ORDER.entries()) {
    const texts = await list.locator('li').allInnerTexts();
    let at = texts.findIndex((x) => x.includes(item));
    while (at > target) {
      await page.getByRole('button', { name: `Перемістити «${item}» вгору` }).click();
      at--;
    }
  }
  await expect(list.locator('li')).toHaveText(ORDER.map((x, i) => new RegExp(`${i + 1}\\s*${x}`)));
  await next.click();

  await page.getByLabel('Ваша відповідь', { exact: true }).fill('Індекси пришвидшують пошук, але сповільнюють запис.');
  await expect(page.getByText('6 слів')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Відповіді' })).toHaveAttribute('aria-valuenow', '5');
  await page.getByRole('button', { name: 'Завершити тест' }).last().click();

  await expect(page).toHaveURL(new RegExp(`/tests/${state.testId}/result$`));
  await expect(page.getByText('На перевірці').first()).toBeVisible();
  await expect(page.getByLabel('Результат 67 відсотків')).toBeVisible();
  await expect(page.getByText('Очікує перевірки · максимум 2')).toBeVisible();
});

test('teacher grades the essay in Manage; the student sees the final score', async ({ page, browser }) => {
  await login(page, USERS.teacher1, `/courses/${state.courseId}/manage?tab=tests`);
  const reviews = page.getByRole('region', { name: /Потребує перевірки/ });
  await expect(reviews).toBeVisible();
  await reviews.getByRole('button', { name: /^Оцінити відповідь/ }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog).toContainText('Індекси пришвидшують пошук');
  await expect(dialog).toContainText('Згадати пошук і вартість запису');
  await dialog.getByLabel('Бали (від 0 до 2)').fill('3');
  await expect(dialog.getByRole('button', { name: 'Зберегти оцінку' })).toBeDisabled();
  await dialog.getByLabel('Бали (від 0 до 2)').fill('2');
  await dialog.getByLabel('Коментар для студента').fill('Добре пояснено.');
  await dialog.getByRole('button', { name: 'Зберегти оцінку' }).click();
  await expect(page.getByText('Оцінку збережено').first()).toBeVisible();
  await expect(reviews).toHaveCount(0);

  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'uk-UA' });
  const student = await ctx.newPage();
  failOnPageErrors(student);
  await login(student, state.student, `/courses/${state.courseId}/tests/${state.testId}/result`);
  await expect(student.getByLabel('Результат 100 відсотків')).toBeVisible();
  await expect(student.getByText('Тест складено')).toBeVisible();
  await expect(student.getByText('Добре пояснено.')).toBeVisible();
  await ctx.close();
});

test('GIFT import fills the course question bank', async ({ page }) => {
  await login(page, USERS.teacher1, `/teacher/courses/${state.courseId}/builder?tab=bank`);
  const bank = page.getByRole('region', { name: 'Банк питань курсу' });
  await expect(bank).toBeVisible();
  await expect(bank.getByText('Банк питань порожній')).toBeVisible();
  await bank.getByLabel('Файл GIFT').setInputFiles(path.join(__dirname, 'fixtures', 'question-bank.gift'));
  await expect(bank.getByRole('status')).toContainText('Імпортовано: 5. Пропущено: 1.');
  const category = bank.getByRole('region', { name: 'Категорія SQL імпорт' });
  await expect(category).toBeVisible();
  await expect(category.getByText('5 питань')).toBeVisible();
  await expect(category.getByLabel('Текст питання 1')).toHaveValue('Яка команда вибирає дані?');
  await expect(category.getByLabel('Тип питання 4')).toHaveValue('MATCHING');

  // The type filter narrows the list.
  await bank.getByRole('combobox', { name: /^Тип питань/ }).selectOption('ESSAY');
  await expect(category.getByLabel(/^Текст питання/)).toHaveCount(1);
});
