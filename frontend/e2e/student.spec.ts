import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { api, API_URL, apiToken, catalogAll, failOnPageErrors, login, logout, uid, USERS } from './helpers';

/** Multipart upload of a fixture file through the API (test setup only). */
async function uploadAs(token: string, apiPath: string, field: string, fixture: string, type: string) {
  const form = new FormData();
  const bytes = await readFile(path.join(__dirname, 'fixtures', fixture));
  form.append(field, new Blob([bytes], { type }), fixture);
  const res = await fetch(`${API_URL}${apiPath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`upload ${apiPath}: ${res.status} ${await res.text()}`);
}

/**
 * Student flows through the real UI. State-changing scenarios use fresh
 * students registered via the API (dev mode returns the confirm token), so the
 * suite can be re-run without reseeding.
 */

interface CatalogItem {
  id: number;
  title: string;
  price: number;
}
interface CourseLesson {
  id: number;
  title: string;
  test: { id: number; title: string } | null;
  files?: { id: number; name: string; url: string }[];
  videoUrl: string | null;
}
interface CourseDetail {
  id: number;
  title: string;
  sections: { title: string; lessons: CourseLesson[] }[];
}

const PASSWORD = 'demo1234';
const AVATAR = path.join(__dirname, 'fixtures', 'student-avatar.png');

let courses: Record<string, CatalogItem>;

async function courseId(title: string): Promise<number> {
  const c = courses[title];
  if (!c) throw new Error(`Course "${title}" not in catalog`);
  return c.id;
}

/** Registers and confirms a new student; returns credentials. */
async function freshStudent(tag: string) {
  const email = `e2e-${tag}-${uid()}@lms.local`;
  const reg = await api<{ confirmToken?: string }>('/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: PASSWORD,
      role: 'STUDENT',
      firstName: 'Тест',
      lastName: tag,
    }),
  });
  if (!reg.confirmToken) throw new Error('No confirmToken: backend must run without SMTP');
  await api('/auth/confirm', undefined, {
    method: 'POST',
    body: JSON.stringify({ token: reg.confirmToken }),
  });
  return { email, password: PASSWORD };
}

async function courseDetail(id: number, user: { email: string; password: string }) {
  return api<CourseDetail>(`/courses/${id}`, await apiToken(user));
}

/** Structure items append a hidden "(пройдено)" to done lessons' names. */
function itemName(title: string): RegExp {
  return new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\(пройдено\\))?$`);
}

function lessons(c: CourseDetail): CourseLesson[] {
  return c.sections.flatMap((s) => s.lessons);
}

/** Test titles in the UI drop a duplicated "Тест" prefix. */
function testLabel(title: string) {
  return /^тест/i.test(title.trim()) ? title : `Тест: ${title}`;
}

/** Answers every question with its first option, then submits. */
async function answerAllAndFinish(page: Page) {
  await expect(page.getByRole('timer')).toBeVisible();
  const counter = page.getByText(/^Питання \d+ з \d+$/);
  const total = Number((await counter.textContent())!.match(/з (\d+)/)![1]);
  for (let i = 0; i < total; i++) {
    await expect(counter).toHaveText(`Питання ${i + 1} з ${total}`);
    await page.locator('fieldset button[aria-pressed]').first().click();
    await expect(page.locator('fieldset button[aria-pressed="true"]')).toHaveCount(1);
    if (i < total - 1) await page.getByRole('button', { name: /^Наступне/ }).click();
  }
  await expect(page.getByRole('progressbar', { name: 'Відповіді' })).toHaveAttribute(
    'aria-valuenow',
    String(total),
  );
  await page.getByRole('button', { name: 'Завершити тест' }).last().click();
}

test.beforeAll(async () => {
  courses = Object.fromEntries((await catalogAll<CatalogItem>()).map((c) => [c.title, c]));
});

test.beforeEach(async ({ page }) => {
  failOnPageErrors(page);
});

test.describe('seeded student (student@lms.local)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.student);
  });

  test('dashboard: greeting, stats, continue learning, upcoming', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: /Олена/ })).toBeVisible();
    const stats = page.getByRole('region', { name: 'Статистика' });
    for (const label of ['Активні курси', 'Уроків пройдено', 'Середній бал тестів']) {
      await expect(stats.getByText(label)).toBeVisible();
    }
    await expect(stats.getByText(/завершено/i)).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Найближче' })).toBeVisible();
    const upcomingTest = page.locator('aside a[href*="?test="]').first();
    await expect(upcomingTest).toBeVisible();
    await expect(page.locator('aside a[href^="/chat?c="]').first()).toBeVisible();

    const continueSection = page.locator('section[aria-labelledby="continue-title"]');
    await expect(continueSection.getByRole('heading', { name: 'Продовжити навчання' })).toBeVisible();
    const go = continueSection.getByRole('link', { name: /^(Продовжити|Почати)$/ }).first();
    const href = await go.getAttribute('href');
    await go.click();
    await expect(page).toHaveURL(new RegExp(`${href!.replace('?', '\\?')}$`));
    await expect(page.getByRole('navigation', { name: 'Зміст курсу' })).toBeVisible();
  });

  test('my courses tabs and the public certificate', async ({ page, context }) => {
    await page.goto('/my-courses');
    await expect(page.getByRole('heading', { level: 1, name: 'Мої курси' })).toBeVisible();
    const tabs = page.getByRole('tablist', { name: 'Статус курсів' });
    await expect(tabs.getByRole('tab', { name: /Активні/ })).toHaveAttribute('aria-selected', 'true');

    await tabs.getByRole('tab', { name: /Завершені/ }).click();
    await expect(page).toHaveURL(/tab=completed/);
    const card = page.locator('article', { hasText: 'Git і GitHub з нуля' });
    await expect(card.getByText('Завершено · 100%')).toBeVisible();

    await page.goto('/my-courses?tab=pending');
    await expect(tabs.getByRole('tab', { name: /Очікують/ })).toHaveAttribute('aria-selected', 'true');

    await page.goto('/my-courses?tab=completed');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await card.getByRole('link', { name: 'Сертифікат' }).click();
    await expect(page).toHaveURL(/\/certificates\/LMS-\d{4}-\d{6}/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Сертифікат про завершення курсу' }),
    ).toBeVisible();
    const code = page.url().split('/certificates/')[1];
    await expect(page.getByText(`№ ${code}`)).toBeVisible();
    await expect(page.getByRole('img', { name: 'QR-код для перевірки сертифіката' })).toBeVisible();
    await expect(page.locator('svg[aria-label="QR-код для перевірки сертифіката"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Завантажити PDF' })).toBeVisible();
    await page.getByRole('button', { name: 'Поділитися посиланням' }).click();
    await expect(page.getByText('Посилання скопійовано')).toBeVisible();
  });

  test('course page: structure navigation, content, prev/next', async ({ page }) => {
    const id = await courseId('Основи веб-розробки');
    const course = await courseDetail(id, USERS.student);
    const all = lessons(course);
    const [first, second] = all;
    const withTest = all.find((l) => l.test)!;

    await page.goto(`/courses/${id}`);
    const nav = page.getByRole('navigation', { name: 'Зміст курсу' });
    await expect(nav).toBeVisible();

    // Sections collapse; open the first one if needed, then pick a lesson.
    const firstBtn = nav.getByRole('button', { name: itemName(first.title) });
    if (!(await firstBtn.isVisible())) {
      await nav.getByRole('button', { name: new RegExp(course.sections[0].title) }).click();
    }
    await firstBtn.click();
    await expect(page).toHaveURL(new RegExp(`\\?lesson=${first.id}$`));
    await expect(page.getByRole('heading', { level: 1, name: first.title })).toBeVisible();

    // Lesson HTML is rendered (and sanitized: no scripts inside the article).
    const article = page.locator('article').first();
    await expect(article.locator('h2, p').first()).toBeVisible();
    await expect(article.locator('script')).toHaveCount(0);

    const testBtn = nav.getByRole('button', { name: itemName(testLabel(withTest.test!.title)) });
    if (!(await testBtn.isVisible())) {
      const section = course.sections.find((s) => s.lessons.some((l) => l.id === withTest.id))!;
      await nav.getByRole('button', { name: new RegExp(section.title) }).click();
    }
    await testBtn.click();
    await expect(page).toHaveURL(new RegExp(`\\?test=${withTest.test!.id}$`));
    await expect(page.getByRole('button', { name: /Почати тест|Пройти ще раз/ })).toBeVisible();

    // Back to a lesson that has a predecessor and use the "previous" button.
    await page.goto(`/courses/${id}?lesson=${second.id}`);
    await expect(page.getByRole('heading', { level: 1, name: second.title })).toBeVisible();
    const prevLabel = first.test ? testLabel(first.test.title) : first.title;
    await page.getByRole('button', { name: `Попередній: ${prevLabel}`, exact: true }).click();
    await expect(page).toHaveURL(
      first.test ? new RegExp(`\\?test=${first.test.id}$`) : new RegExp(`\\?lesson=${first.id}$`),
    );
  });

  test('lesson attachments', async ({ page }) => {
    const id = await courseId('Основи веб-розробки');
    let course = await courseDetail(id, USERS.student);
    let lesson = lessons(course).find((l) => (l.files?.length ?? 0) > 0);
    if (!lesson) {
      // Fresh seed has no uploads: attach a file as the course teacher.
      const target = lessons(course).find((l) => /Flexbox/.test(l.title)) ?? lessons(course)[0];
      const token = await apiToken(USERS.teacher1);
      await uploadAs(token, `/lessons/${target.id}/files`, 'file', 'teacher-grid.css', 'text/css');
      course = await courseDetail(id, USERS.student);
      lesson = lessons(course).find((l) => l.id === target.id);
    }

    await page.goto(`/courses/${id}?lesson=${lesson!.id}`);
    await expect(page.getByRole('heading', { level: 1, name: lesson!.title })).toBeVisible();
    const files = page.locator('section', { has: page.getByRole('heading', { name: 'Матеріали до уроку' }) });
    await expect(files).toBeVisible();
    for (const f of lesson!.files!) {
      const link = files.getByRole('link', { name: f.name, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('download', f.name);
      await expect(files.getByRole('link', { name: `Завантажити ${f.name}` })).toBeVisible();
    }

    // Files are served only through signed links (or a Bearer token).
    const signed = lesson!.files![0].url;
    expect(signed).toMatch(/\/files\/lesson-file\/\d+\?u=\d+&exp=\d+&sig=/);
    expect((await page.request.get(signed)).status()).toBe(200);
    const ranged = await page.request.get(signed, { headers: { Range: 'bytes=0-3' } });
    expect(ranged.status()).toBe(206);
    expect((await page.request.get(signed.split('?')[0])).status()).toBe(401);
    expect((await page.request.get(signed.replace(/sig=[^&]+/, 'sig=forged'))).status()).toBe(401);
  });

  test('course chat: send a message; direct chat with teacher is listed', async ({ page }) => {
    const id = await courseId('Основи веб-розробки');
    await page.goto(`/courses/${id}`);
    await page.getByRole('button', { name: 'Чат курсу' }).first().click();
    await expect(page).toHaveURL(/\/chat\?c=\d+/);

    const text = `E2E повідомлення ${uid()}`;
    await page.getByRole('textbox', { name: 'Повідомлення' }).fill(text);
    await page.getByRole('button', { name: 'Надіслати' }).click();
    await expect(page.locator('[aria-live="polite"]').getByText(text)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Повідомлення' })).toHaveValue('');

    const list = page.getByRole('complementary', { name: 'Розмови' });
    await expect(list.getByRole('heading', { name: 'Особисті' })).toBeVisible();
    await expect(list.getByRole('button', { name: /Ірина Мельник/ })).toBeVisible();
  });

  test('access control: admin and teacher pages redirect home', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/teacher/courses/new');
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('fresh students', () => {
  test('enroll in a free course from its landing and complete a lesson', async ({ page }) => {
    const user = await freshStudent('enroll');
    const id = await courseId('Основи веб-розробки');
    await login(page, user);

    await page.goto(`/c/${id}`);
    await page.getByRole('button', { name: 'Почати навчання' }).click();
    await expect(page).toHaveURL(new RegExp(`/courses/${id}`));

    const course = await courseDetail(id, user);
    const [first, second] = lessons(course);
    await expect(page.getByRole('heading', { level: 1, name: first.title })).toBeVisible();
    const progress = page.getByRole('progressbar', { name: 'Прогрес курсу' }).first();
    await expect(progress).toHaveAttribute('aria-valuenow', '0');

    await page.getByRole('button', { name: 'Завершити і далі' }).click();
    await expect(page).not.toHaveURL(new RegExp(`\\?lesson=${first.id}$`));
    const expected = first.test ? `?test=${first.test.id}` : `?lesson=${second.id}`;
    await expect(page).toHaveURL(new RegExp(`${expected.replace('?', '\\?')}$`));
    await expect(progress).not.toHaveAttribute('aria-valuenow', '0');

    const nav = page.getByRole('navigation', { name: 'Зміст курсу' });
    await expect(nav.getByRole('button', { name: new RegExp(`${first.title}.*пройдено`) })).toBeVisible();

    // The landing now offers to continue instead of enrolling.
    await page.goto(`/c/${id}`);
    await expect(page.getByRole('link', { name: 'Перейти до курсу' })).toBeVisible();
  });

  test('take a test: answer all, results, retake with unanswered confirm, exit', async ({ page }) => {
    const user = await freshStudent('test');
    const id = await courseId('Основи веб-розробки');
    await api(`/courses/${id}/enroll`, await apiToken(user), { method: 'POST' });
    const t = lessons(await courseDetail(id, user)).find((l) => l.test)!.test!;

    await login(page, user, `/courses/${id}?test=${t.id}`);
    await expect(page).toHaveURL(new RegExp(`\\?test=${t.id}$`));
    await page.getByRole('button', { name: 'Почати тест' }).click();

    // Navigator grid reflects the current question.
    const grid = page.getByRole('navigation', { name: 'Навігація по питаннях' });
    await expect(grid.getByRole('button', { name: 'Питання 1, поточне' })).toBeVisible();
    await answerAllAndFinish(page);

    await expect(page).toHaveURL(new RegExp(`/courses/${id}/tests/${t.id}/result$`));
    await expect(page.getByLabel(/^Результат \d+ відсотків$/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Історія спроб' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Розбір відповідей' })).toBeVisible();
    const rows = page.locator('section[aria-labelledby="attempts-title"] tbody tr');
    await expect(rows).toHaveCount(1);

    // Retake and submit immediately: the unanswered-confirm dialog appears.
    await page.getByRole('link', { name: 'Пройти ще раз' }).click();
    await expect(page).toHaveURL(new RegExp(`\\?test=${t.id}$`));
    await page.getByRole('button', { name: 'Пройти ще раз' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    await page.getByRole('button', { name: 'Завершити тест' }).first().click();
    // Several <dialog>s share id="modal-title", so match the open one by text.
    const dialog = page.locator('dialog[open]');
    await expect(dialog).toContainText('Завершити тест?');
    await dialog.getByRole('button', { name: 'Завершити' }).click();
    await expect(page).toHaveURL(/\/result$/);
    await expect(rows).toHaveCount(2);

    // A third start, then leave via the exit dialog.
    await page.getByRole('link', { name: 'Пройти ще раз' }).click();
    await page.getByRole('button', { name: 'Пройти ще раз' }).click();
    await page.getByRole('button', { name: 'Вийти з тесту' }).click();
    const exit = page.locator('dialog[open]');
    await expect(exit).toContainText('Вийти з тесту?');
    await exit.getByRole('button', { name: 'Вийти', exact: true }).click();
    await expect(page.getByRole('timer')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Пройти ще раз' })).toBeVisible();
  });

  test('checkout: buy a paid course, see it in my courses and purchases', async ({ page }) => {
    const user = await freshStudent('buy');
    const title = 'Англійська для IT';
    const id = await courseId(title);
    await login(page, user);

    await page.goto(`/c/${id}`);
    await page.getByRole('link', { name: /^Купити за/ }).click();
    await expect(page).toHaveURL(new RegExp(`/checkout/${id}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Оформлення покупки' })).toBeVisible();
    await expect(page.getByRole('note')).toContainText('Тестова оплата');
    await expect(page.getByLabel('Номер картки')).toHaveValue(/4242/);
    await page.getByRole('button', { name: /^Оплатити/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Оплата успішна — курс у вашому кабінеті' }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Історія покупок' }).click();
    await expect(page).toHaveURL(/\/purchases$/);
    const row = page.getByRole('row', { name: new RegExp(title) });
    await expect(row).toBeVisible();
    await expect(row.getByText('Оплачено')).toBeVisible();
    await row.getByRole('button', { name: 'Квитанція' }).click();
    const receipt = page.locator('dialog[open]');
    await expect(receipt).toContainText(title);
    await expect(receipt).toContainText('900');
    await receipt.getByRole('button', { name: /Закрити/ }).click();
    await expect(receipt).toBeHidden();

    await page.goto('/my-courses');
    await expect(page.locator('article', { hasText: title })).toBeVisible();

    // Back on checkout the course is reported as already owned.
    await page.goto(`/checkout/${id}`);
    await expect(page.getByRole('heading', { name: 'Цей курс уже доступний вам' })).toBeVisible();
  });

  test('request access to an approval-only course', async ({ page }) => {
    const user = await freshStudent('request');
    const title = 'Бази даних і SQL';
    const id = await courseId(title);
    await login(page, user);

    await page.goto(`/c/${id}`);
    await expect(page.getByText('Доступ відкриється після схвалення викладачем.')).toBeVisible();
    await page.getByRole('button', { name: 'Подати заявку' }).click();
    await expect(page.getByText('Заявку надіслано викладачу')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Заявку надіслано' })).toBeDisabled();

    await page.goto('/my-courses?tab=pending');
    const card = page.locator('article', { hasText: title });
    await expect(card.getByText('Заявка на розгляді у викладача')).toBeVisible();

    // Without approval the course content stays closed.
    await page.goto(`/courses/${id}`);
    // The course query retries the 403 a few times before showing the message.
    await expect(page.getByText('Ви ще не записані на цей курс')).toBeVisible({ timeout: 20_000 });
  });

  test('notifications: filters, open one, mark all read, header bell', async ({ page }) => {
    const user = await freshStudent('notif');
    const token = await apiToken(user);
    for (const title of ['Англійська для IT', 'TypeScript для початківців']) {
      await api(`/store/courses/${await courseId(title)}/purchase`, token, { method: 'POST' });
    }
    await login(page, user);

    const bell = page.getByRole('link', { name: /^Сповіщення/ });
    await expect(bell).toHaveAccessibleName('Сповіщення, 2 нових');
    await bell.click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByText('2 непрочитані')).toBeVisible();

    const tabs = page.getByRole('tablist', { name: 'Фільтр сповіщень' });
    const list = page.getByRole('region', { name: 'Список сповіщень' });
    await tabs.getByRole('tab', { name: /Непрочитані/ }).click();
    await expect(list.getByRole('img', { name: 'Непрочитане' })).toHaveCount(2);
    await tabs.getByRole('tab', { name: 'Тести' }).click();
    await expect(list.getByText('Сповіщень немає')).toBeVisible();
    await tabs.getByRole('tab', { name: 'Усі' }).click();

    // Opening a notification marks it read and follows its link.
    await list.getByRole('button').first().click();
    await expect(page).toHaveURL(/\/courses\/\d+/);
    await expect(bell).toHaveAccessibleName('Сповіщення, 1 нових');

    await page.goto('/notifications');
    await page.getByRole('button', { name: 'Позначити всі як прочитані' }).click();
    await expect(page.getByText('Усі сповіщення прочитано')).toBeVisible();
    await expect(page.getByText('Усе прочитано')).toBeVisible();
    await expect(bell).toHaveAccessibleName('Сповіщення');
  });

  test('profile: name, theme, avatar, sessions, password change', async ({ page }) => {
    const user = await freshStudent('profile');
    await login(page, user, '/profile');
    await expect(page.getByRole('heading', { level: 1, name: 'Профіль і налаштування' })).toBeVisible();

    await page.getByLabel('Ім’я').fill('Марія');
    await page.getByLabel('Прізвище').fill('Тестова');
    await page.getByRole('button', { name: 'Зберегти зміни' }).click();
    await expect(page.getByText('Зміни збережено')).toBeVisible();
    await page.getByRole('button', { name: 'Меню користувача' }).click();
    await expect(page.getByRole('menu')).toContainText('Марія Тестова');
    await page.keyboard.press('Escape');

    const theme = page.getByRole('group', { name: 'Тема оформлення' });
    await theme.getByRole('button', { name: 'Темна', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await theme.getByRole('button', { name: 'Світла', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.locator('input[type="file"]').first().setInputFiles(AVATAR);
    await expect(page.getByText('Фото оновлено')).toBeVisible();
    await expect(page.locator('header img').first()).toHaveAttribute('src', /avatars/);

    await expect(page.getByRole('heading', { name: 'Активні сесії' })).toBeVisible();
    await expect(page.getByText('Цей пристрій')).toBeVisible();

    const newPassword = 'demo5678';
    await page.getByLabel('Поточний пароль').fill(user.password);
    await page.getByLabel('Новий пароль').fill(newPassword);
    await page.getByLabel('Повторіть пароль').fill(newPassword);
    await page.getByRole('button', { name: 'Змінити пароль' }).click();
    await expect(page.getByText('Пароль змінено')).toBeVisible();

    await logout(page);
    await login(page, { email: user.email, password: newPassword });
    await expect(page.getByRole('heading', { level: 1, name: /Марія/ })).toBeVisible();
  });
});
