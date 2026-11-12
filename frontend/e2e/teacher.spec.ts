import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { API_URL, USERS, failOnPageErrors, login, uid } from './helpers';

/**
 * Teacher flows through the real UI: dashboard, course wizard, builder
 * (lessons, video, attachments, tests, settings, publishing), enrollment
 * approval with a fresh student, the manage page and ownership checks.
 * Every run creates its own course and student, so no reseed is needed.
 */

const FIXTURES = join(__dirname, 'fixtures');
const COVER = join(FIXTURES, 'teacher-cover.png');
const VIDEO = join(FIXTURES, 'teacher-video.mp4');
const NOTES = join(FIXTURES, 'teacher-Конспект уроку.md');
const CSS = join(FIXTURES, 'teacher-grid.css');
const EVIL = join(FIXTURES, 'teacher-evil.html');

// 1×1 PNG.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const run = uid();
const COURSE_TITLE = `E2E курс ${run}`;
const LESSON_TITLE = `Вступ ${run}`;

const state: {
  courseId?: number;
  student?: { email: string; password: string; name: string };
} = {};

async function registerStudent(): Promise<{ email: string; password: string; name: string }> {
  const id = uid();
  const email = `teach-e2e-${id}@e2e.local`;
  const password = 'Student-pass-123';
  const lastName = `Студент${id.slice(-4)}`;
  const reg = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role: 'STUDENT', firstName: 'Тест', lastName }),
  });
  const { confirmToken } = (await reg.json()) as { confirmToken?: string };
  if (!confirmToken) throw new Error('Expected a dev confirm token (SMTP must be off)');
  const conf = await fetch(`${API_URL}/auth/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: confirmToken }),
  });
  if (!conf.ok) throw new Error(`confirm failed: ${conf.status}`);
  return { email, password, name: `Тест ${lastName}` };
}

async function publicCatalogTitles(search: string): Promise<string[]> {
  const res = await fetch(`${API_URL}/store/catalog?search=${encodeURIComponent(search)}`);
  const body = (await res.json()) as { items: { title: string }[] };
  return body.items.map((i) => i.title);
}

/** A separate browser context so two roles can be signed in at once. */
async function pageAs(browser: Browser, user: { email: string; password: string }, next = '/') {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: 'uk-UA' });
  const page = await context.newPage();
  failOnPageErrors(page);
  await login(page, user, next);
  return page;
}

/**
 * The open <dialog>. Located by its heading: every Modal shares
 * id="modal-title", so the accessible name of a dialog can be another
 * modal's title (see BUG in the report).
 */
function openDialog(page: Page, title: string) {
  return page.locator('dialog[open]').filter({ has: page.getByRole('heading', { name: title }) });
}

function toast(page: Page, text: string | RegExp) {
  return page.getByText(text).first();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  mkdirSync(FIXTURES, { recursive: true });
  if (!existsSync(COVER)) writeFileSync(COVER, PNG_1PX);
  writeFileSync(NOTES, '# Конспект\n\nFlexbox і Grid коротко.\n');
  writeFileSync(CSS, '.grid { display: grid; gap: 20px; }\n');
  writeFileSync(EVIL, '<script>alert(1)</script>\n');
  if (!existsSync(VIDEO)) {
    execFileSync('ffmpeg', [
      '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=15:duration=2',
      '-pix_fmt', 'yuv420p', VIDEO,
    ]);
  }
});

test.beforeEach(({ page }) => {
  failOnPageErrors(page);
});

test('teacher dashboard shows stats, courses, activity and requests', async ({ page }) => {
  await login(page, USERS.teacher1);
  await expect(page.getByRole('heading', { level: 1, name: /Добрий день, Ірина/ })).toBeVisible();

  const stats = page.getByRole('region', { name: 'Статистика' });
  for (const label of ['Студентів', 'Активні курси', 'Нові заявки', 'Середній бал тестів']) {
    await expect(stats.getByText(label, { exact: true })).toBeVisible();
  }

  await expect(page.getByRole('heading', { name: 'Мої курси' })).toBeVisible();
  const webRow = page.getByRole('row', { name: /Основи веб-розробки/ });
  await expect(webRow.getByRole('link', { name: 'Редагувати' })).toHaveAttribute(
    'href',
    /\/teacher\/courses\/\d+\/builder/,
  );
  await expect(webRow.getByRole('link', { name: 'Керувати' })).toHaveAttribute(
    'href',
    /\/courses\/\d+\/manage/,
  );

  await expect(page.getByRole('heading', { name: 'Активність студентів за тиждень' })).toBeVisible();
  await expect(page.getByText(/Пройдені уроки за останні 7 днів, усього \d+/)).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Тести, що потребують уваги' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Нові заявки' })).toBeVisible();
  // Seed: three pending requests in «Бази даних і SQL».
  await expect(page.getByRole('button', { name: 'Схвалити' }).first()).toBeVisible();

  await page.getByRole('link', { name: 'Створити курс' }).first().click();
  await expect(page).toHaveURL(/\/teacher\/courses\/new/);
});

test('course wizard validates, uploads a cover and saves a draft', async ({ page }) => {
  await login(page, USERS.teacher1, '/teacher/courses/new');
  await expect(page.getByRole('heading', { name: '1. Основне' })).toBeVisible();

  // Step 1 validation.
  await page.getByRole('button', { name: 'Далі' }).click();
  await expect(page.getByText('Назва має містити щонайменше 3 символи')).toBeVisible();

  await page.getByLabel('Назва курсу').fill(COURSE_TITLE);
  await page.getByLabel('Опис курсу').fill('Курс, створений автотестом Playwright для перевірки конструктора.');
  await page.getByLabel('Категорія').selectOption('Програмування');
  await page.getByLabel('Рівень').selectOption({ label: 'Початковий' });
  await page.getByRole('button', { name: 'Далі' }).click();

  // Step 2: cover, price validation, then free + approval.
  await expect(page.getByRole('heading', { name: '2. Обкладинка і ціна' })).toBeVisible();
  await page.getByLabel('Файл обкладинки').setInputFiles(COVER);
  await expect(page.getByRole('img', { name: 'Обкладинка курсу' })).toBeVisible();

  await page.getByRole('radio', { name: 'Платний' }).check();
  await expect(page.getByText('Платний курс відкривається автоматично одразу після оплати.')).toBeVisible();
  await page.getByRole('button', { name: 'Далі' }).click();
  await expect(page.getByText('Вкажіть ціну більше 0 ₴')).toBeVisible();

  await page.getByRole('radio', { name: 'Безкоштовний' }).check();
  await page.getByRole('radio', { name: 'За схваленням викладача' }).check();
  await page.getByRole('button', { name: 'Далі' }).click();

  // Step 3 summary.
  await expect(page.getByRole('heading', { name: '3. Публікація' })).toBeVisible();
  const summary = page.locator('dl');
  await expect(summary.getByText(COURSE_TITLE)).toBeVisible();
  await expect(summary.getByText('Програмування · Початковий')).toBeVisible();
  await expect(summary.getByText('Безкоштовно')).toBeVisible();
  await expect(summary.getByText('За схваленням викладача')).toBeVisible();

  await page.getByRole('button', { name: 'Зберегти чернетку' }).click();
  await expect(page).toHaveURL(/\/teacher\/courses\/\d+\/builder/);
  state.courseId = Number(/courses\/(\d+)\/builder/.exec(page.url())![1]);

  await expect(page.getByRole('heading', { level: 1, name: COURSE_TITLE })).toBeVisible();
  await expect(page.getByText('Чернетка', { exact: true })).toBeVisible();
  expect(await publicCatalogTitles(COURSE_TITLE)).not.toContain(COURSE_TITLE);
});

test('builder: sections, lesson, video, attachments, test, settings, publish', async ({ page }) => {
  test.setTimeout(120_000);
  expect(state.courseId, 'wizard test must create the course').toBeTruthy();
  await login(page, USERS.teacher1, `/teacher/courses/${state.courseId}/builder`);
  const structure = page.getByRole('complementary', { name: 'Структура курсу' });

  // Section + lesson.
  await structure.getByRole('button', { name: 'Додати розділ' }).click();
  await expect(structure.getByRole('button', { name: '1. Розділ 1' })).toBeVisible();
  await structure.getByRole('button', { name: 'Урок', exact: true }).click();
  await expect(page.getByLabel('Назва уроку')).toHaveValue('Новий урок');

  // Lesson text.
  await page.getByLabel('Назва уроку').fill(LESSON_TITLE);
  await page.getByLabel('Матеріал уроку').fill('<h2>Що вивчимо</h2><p>Flexbox і Grid.</p>');
  await page.getByRole('button', { name: 'Зберегти урок' }).click();
  await expect(toast(page, 'Урок збережено')).toBeVisible();
  await expect(structure.getByRole('button', { name: LESSON_TITLE, exact: true })).toBeVisible();

  // Video by link: preview only, not saved.
  await page.getByLabel('Посилання на відео').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await expect(page.locator(`iframe[title="Відео уроку ${LESSON_TITLE}"]`)).toHaveAttribute(
    'src',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
  );

  // Own video file.
  await page.getByRole('button', { name: 'Свій файл' }).click();
  await page.locator('input[type="file"]:not([multiple])[accept*=".mp4"]').setInputFiles(VIDEO);
  await expect(toast(page, 'Відео завантажено, починається обробка')).toBeVisible({ timeout: 30_000 });
  // Transcoding to HLS runs on the server; the editor polls its progress.
  await expect(page.getByText('Відео готове до перегляду')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('video').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Замінити відео' })).toBeVisible();

  // Attachments: two files, Cyrillic name kept.
  const filesInput = page.locator('input[type="file"][multiple]');
  await filesInput.setInputFiles([NOTES, CSS]);
  await expect(page.getByRole('link', { name: 'teacher-Конспект уроку.md' }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('link', { name: 'teacher-grid.css' }).first()).toBeVisible();

  // Unsupported type is rejected.
  await filesInput.setInputFiles(EVIL);
  await expect(toast(page, /teacher-evil\.html.*Такий тип файлу не підтримується/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'teacher-evil.html' })).toHaveCount(0);

  // Delete via confirm dialog.
  await page.getByRole('button', { name: 'Видалити файл teacher-grid.css' }).click();
  const dialog = openDialog(page, 'Видалити файл?');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Видалити' }).click();
  await expect(toast(page, 'Файл видалено')).toBeVisible();
  await expect(page.getByRole('link', { name: 'teacher-grid.css' })).toHaveCount(0);

  // Test with a single- and a multiple-choice question.
  await structure.getByRole('button', { name: `Додати тест до уроку ${LESSON_TITLE}` }).click();
  const editor = page.getByRole('region', { name: 'Редактор тесту' });
  await expect(editor).toBeVisible();

  await editor.getByRole('button', { name: 'Додати питання' }).click();
  const q1 = editor.getByLabel('Текст питання 1');
  await expect(q1).toBeVisible();
  await q1.fill('Яка властивість вмикає flex-контейнер?');
  await q1.blur();
  const q1Card = editor.locator('li').filter({ has: page.getByLabel('Текст питання 1') });
  await q1Card.getByRole('button', { name: 'Додати варіант' }).click();
  await expect(q1Card.getByLabel('Текст варіанта 1')).toBeVisible();
  await q1Card.getByRole('button', { name: 'Додати варіант' }).click();
  await expect(q1Card.getByLabel('Текст варіанта 2')).toBeVisible();
  await q1Card.getByLabel('Текст варіанта 1').fill('display: flex');
  await q1Card.getByLabel('Текст варіанта 1').blur();
  await q1Card.getByLabel('Текст варіанта 2').fill('position: flex');
  await q1Card.getByLabel('Текст варіанта 2').blur();
  await q1Card.getByLabel('Варіант 1 правильний').click();
  await expect(q1Card.getByLabel('Варіант 1 правильний')).toBeChecked();
  await expect(q1Card.getByText('Правильна')).toHaveCount(1);
  await expect(q1Card.getByLabel('Текст варіанта 1')).toHaveValue('display: flex');

  await editor.getByRole('button', { name: 'Додати питання' }).click();
  const q2 = editor.getByLabel('Текст питання 2');
  await expect(q2).toBeVisible();
  await q2.fill('Що належить до Grid?');
  await q2.blur();
  const q2Card = editor.locator('li').filter({ has: page.getByLabel('Текст питання 2') });
  await q2Card.getByLabel('Тип питання 2').selectOption('MULTIPLE');
  for (const n of [1, 2, 3]) {
    await q2Card.getByRole('button', { name: 'Додати варіант' }).click();
    await expect(q2Card.getByLabel(`Текст варіанта ${n}`)).toBeVisible();
  }
  await q2Card.getByLabel('Варіант 1 правильний').click();
  await expect(q2Card.getByLabel('Варіант 1 правильний')).toBeChecked();
  await expect(q2Card.getByText('Правильна')).toHaveCount(1);
  await q2Card.getByLabel('Варіант 3 правильний').click();
  await expect(q2Card.getByLabel('Варіант 3 правильний')).toBeChecked();
  await expect(q2Card.getByText('Правильна')).toHaveCount(2);
  await expect(q2Card.getByLabel('Варіант 1 правильний')).toHaveAttribute('type', 'checkbox');

  // Settings tab.
  await page.getByRole('tab', { name: 'Налаштування і ціна' }).click();
  await page.getByLabel('Категорія').selectOption('Дизайн');
  await page.getByLabel('Рівень').selectOption({ label: 'Середній' });
  await page.getByRole('button', { name: 'Зберегти зміни' }).click();
  await expect(toast(page, 'Налаштування збережено')).toBeVisible();

  // Publish → public catalog + landing.
  await page.getByRole('button', { name: 'Опублікувати' }).click();
  await expect(toast(page, 'Курс опубліковано')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Зняти з публікації' })).toBeVisible();
  await expect.poll(() => publicCatalogTitles(COURSE_TITLE)).toContain(COURSE_TITLE);

  await page.goto(`/catalog?search=${encodeURIComponent(COURSE_TITLE)}`);
  await expect(page.getByText(COURSE_TITLE).first()).toBeVisible();
  await page.goto(`/c/${state.courseId}`);
  await expect(page.getByRole('heading', { level: 1, name: COURSE_TITLE })).toBeVisible();
  await expect(page.getByText('Дизайн').first()).toBeVisible();
});

test('fresh student requests access, teacher approves, student sees files and video', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  expect(state.courseId).toBeTruthy();
  state.student = await registerStudent();
  const student = state.student;

  // Student sends a request from the landing.
  const sp = await pageAs(browser, student, `/c/${state.courseId}`);
  await sp.getByRole('button', { name: 'Подати заявку' }).click();
  await expect(toast(sp, 'Заявку надіслано викладачу')).toBeVisible();
  await expect(sp.getByRole('button', { name: 'Заявку надіслано' })).toBeDisabled();

  // Teacher sees it on the dashboard and approves it in Manage.
  const tp = await pageAs(browser, USERS.teacher1);
  await expect(tp.getByText(student.name).first()).toBeVisible();
  await tp.goto(`/courses/${state.courseId}/manage?tab=requests`);
  await expect(tp.getByRole('tab', { name: /Заявки/ })).toHaveAttribute('aria-selected', 'true');
  await tp.getByRole('button', { name: `Схвалити заявку ${student.name}` }).click();
  await expect(tp.getByRole('button', { name: `Схвалити заявку ${student.name}` })).toHaveCount(0);

  // Student now opens the course: video + attachment.
  await sp.goto(`/courses/${state.courseId}`);
  await expect(sp.getByRole('heading', { level: 1, name: LESSON_TITLE })).toBeVisible();
  await expect(sp.locator('article video')).toBeVisible();
  await expect(sp.getByRole('heading', { name: 'Матеріали до уроку' })).toBeVisible();
  const fileLink = sp.getByRole('link', { name: 'teacher-Конспект уроку.md' }).first();
  await expect(fileLink).toBeVisible();
  const href = await fileLink.getAttribute('href');
  const res = await fetch(href!);
  expect(res.status).toBe(200);

  await sp.context().close();
  await tp.context().close();
});

test('manage page: tabs, search, filters, details, message, CSV', async ({ page }) => {
  expect(state.courseId && state.student).toBeTruthy();
  const student = state.student!;
  await login(page, USERS.teacher1, `/courses/${state.courseId}/manage?tab=students`);

  const students = page.getByRole('region', { name: 'Студенти курсу' });
  await expect(students).toBeVisible();
  await students.getByPlaceholder('Пошук студента').fill(student.email);
  await expect(students.getByRole('row', { name: new RegExp(student.name) })).toBeVisible();

  await students.getByLabel('Статус').selectOption({ label: 'Активний' });
  await expect(students.getByRole('row', { name: new RegExp(student.name) })).toBeVisible();
  await students.getByLabel('Статус').selectOption({ label: 'Відхилено' });
  await expect(students.getByRole('row', { name: new RegExp(student.name) })).toHaveCount(0);
  await students.getByLabel('Статус').selectOption({ label: 'Усі' });

  // Details modal.
  await students.getByRole('button', { name: `Деталі ${student.name}` }).click();
  const details = openDialog(page, student.name);
  await expect(details).toBeVisible();
  await expect(details.getByText('Прогрес курсу')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(details).toBeHidden();

  // CSV export.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    students.getByRole('button', { name: 'Експорт CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);

  // Tests tab.
  await page.getByRole('tab', { name: 'Результати тестів' }).click();
  await expect(page).toHaveURL(/tab=tests/);
  await expect(page.getByRole('region', { name: 'Результати тестів' }).getByRole('row', { name: new RegExp(LESSON_TITLE) })).toBeVisible();

  // Requests tab is empty now.
  await page.getByRole('tab', { name: /Заявки/ }).click();
  await expect(page).toHaveURL(/tab=requests/);

  // Message the student → direct chat.
  await page.getByRole('tab', { name: /Студенти/ }).click();
  await page.getByRole('button', { name: `Написати ${student.name}` }).click();
  await expect(page).toHaveURL(/\/chat\?c=\d+/);
});

test('another teacher cannot open the builder', async ({ page }) => {
  expect(state.courseId).toBeTruthy();
  await login(page, USERS.teacher2, `/teacher/courses/${state.courseId}/builder`);
  await expect(page.getByRole('heading', { name: 'Немає доступу' })).toBeVisible();
  await expect(page.getByText('Редагувати курс може лише його викладач.')).toBeVisible();
});
