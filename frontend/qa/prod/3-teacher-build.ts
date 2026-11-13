import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { BASE, Phase, pause, saveState, state, uiLogin } from './h';

const FIX = (n: string) => path.join(__dirname, '..', '..', 'e2e', 'fixtures', n);
type Acc = { email: string; password: string; name: string };

const toast = (p: Page, text: string | RegExp) => p.getByText(text).first();

function card(editor: Locator, p: Page, n: number) {
  return editor.locator('li').filter({ has: p.getByLabel(`Текст питання ${n}`) });
}
async function addQuestion(p: Page, editor: Locator, n: number, type: string, text: string) {
  await editor.getByRole('button', { name: 'Додати питання', exact: true }).click();
  const q = editor.getByLabel(`Текст питання ${n}`);
  await q.waitFor();
  await q.fill(text);
  await q.blur();
  const c = card(editor, p, n);
  await c.getByLabel(`Тип питання ${n}`).selectOption(type);
  await pause(400);
  return c;
}

(async () => {
  const ph = new Phase('teacher-build');
  const p = await ph.attach();
  const { T } = state<{ T: Acc }>();
  const COURSE = `QA курс перевірки ${new Date().toISOString().slice(5, 16).replace('T', ' ')}`;
  const L1 = 'QA урок 1: YouTube і файли';
  const L2 = 'QA урок 2: своє відео';
  let courseId = Number(state<{ courseId?: number }>().courseId ?? 0);
  // FROM=<step> resumes a phase that was interrupted (earlier steps are skipped).
  const order = ['teacher-dashboard', 'wizard', 'publish-validation-empty', 'section-and-lessons', 'video-upload-cloudinary', 'lesson-files-and-html-download', 'test-all-types', 'question-bank-gift', 'assignment', 'publish'];
  const from = process.env.FROM ? order.indexOf(process.env.FROM) : 0;
  const only = process.env.ONLY;
  const run = (name: string, fn: () => Promise<void>) =>
    (only ? name === only : order.indexOf(name) >= from) ? ph.step(name, fn) : Promise.resolve();

  await uiLogin(ph, T.email, T.password, from > 1 ? `/teacher/courses/${courseId}/builder` : '/');

  await run('teacher-dashboard', async () => {
    await ph.snap('dashboard');
  });

  await run('wizard', async () => {
    await p.goto(`${BASE}/teacher/courses/new`);
    await p.getByRole('heading', { name: '1. Основне' }).waitFor();
    await p.getByRole('button', { name: 'Далі' }).click();
    await ph.snap('wizard-validation', { full: false });
    await p.getByLabel('Назва курсу').fill(COURSE);
    await p.getByLabel('Опис курсу').fill('Тимчасовий курс для повної перевірки застосунку. Буде видалений після перевірки.');
    await p.getByLabel('Категорія').selectOption('Програмування');
    await p.getByLabel('Рівень').selectOption({ label: 'Початковий' });
    await p.getByRole('button', { name: 'Далі' }).click();
    await p.getByRole('heading', { name: '2. Обкладинка і ціна' }).waitFor();
    await p.getByLabel('Файл обкладинки').setInputFiles(FIX('teacher-cover.png'));
    await p.getByRole('img', { name: 'Обкладинка курсу' }).waitFor();
    await p.getByRole('radio', { name: 'Платний' }).check();
    await p.getByRole('button', { name: 'Далі' }).click();
    await ph.snap('wizard-price-validation', { full: false });
    await p.getByRole('radio', { name: 'Безкоштовний' }).check();
    await p.getByRole('radio', { name: 'За схваленням викладача' }).check();
    await p.getByRole('button', { name: 'Далі' }).click();
    await p.getByRole('heading', { name: '3. Публікація' }).waitFor();
    await ph.snap('wizard-summary');
    await p.getByRole('button', { name: 'Зберегти чернетку' }).click();
    await p.waitForURL(/\/teacher\/courses\/\d+\/builder/, { timeout: 60_000 });
    courseId = Number(/courses\/(\d+)\/builder/.exec(p.url())![1]);
    saveState({ courseId, COURSE, L1, L2 });
    await ph.snap('builder-empty');
  });

  const structure = p.getByRole('complementary', { name: 'Структура курсу' });

  await run('publish-validation-empty', async () => {
    await p.getByRole('button', { name: 'Опублікувати' }).click();
    await pause(1200);
    await ph.snap('publish-empty-error', { full: false, axe: false });
  });

  await run('section-and-lessons', async () => {
    await structure.getByRole('button', { name: 'Додати розділ' }).click();
    await structure.getByRole('button', { name: '1. Розділ 1' }).waitFor();
    await structure.getByRole('button', { name: 'Урок', exact: true }).click();
    await pause(800);
    await p.getByLabel('Назва уроку').fill(L1);
    await p.getByLabel('Матеріал уроку').fill(
      '<h2>Що перевіряємо</h2><p>Форматований текст, <strong>жирний</strong>, <a href="https://developer.mozilla.org">посилання</a> і код:</p><pre><code>&lt;h1&gt;Привіт&lt;/h1&gt;</code></pre><script>alert(1)</script>',
    );
    await p.getByRole('button', { name: 'Зберегти урок' }).click();
    await toast(p, 'Урок збережено').waitFor();
    await p.getByLabel('Посилання на відео').fill('https://www.youtube.com/watch?v=ZY6uf5985PI');
    await pause(800);
    await p.getByRole('button', { name: 'Зберегти урок' }).click();
    await pause(1200);
    await ph.snap('lesson1-youtube');
    // Second lesson.
    await structure.getByRole('button', { name: 'Урок', exact: true }).click();
    await pause(800);
    await p.getByLabel('Назва уроку').fill(L2);
    await p.getByLabel('Матеріал уроку').fill('<p>Урок із завантаженим відео (HLS через Cloudinary).</p>');
    await p.getByRole('button', { name: 'Зберегти урок' }).click();
    await toast(p, 'Урок збережено').waitFor();
  });

  await run('video-upload-cloudinary', async () => {
    await structure.getByRole('button', { name: L2, exact: true }).click();
    await pause(800);
    await p.getByRole('button', { name: 'Свій файл' }).click();
    await p.locator('input[type="file"]:not([multiple])[accept*=".mp4"]').setInputFiles(FIX('teacher-video.mp4'));
    await toast(p, 'Відео завантажено, починається обробка').waitFor({ timeout: 60_000 });
    await ph.snap('video-processing', { full: false, axe: false });
    await p.getByText('Відео готове до перегляду').waitFor({ timeout: 240_000 });
    await ph.snap('video-ready');
  });

  await run('lesson-files-and-html-download', async () => {
    await structure.getByRole('button', { name: L1, exact: true }).click();
    await pause(800);
    const files = p.locator('input[type="file"][multiple]');
    await files.setInputFiles([FIX('teacher-Конспект уроку.md'), FIX('teacher-evil.html')]);
    const md = p.getByRole('link', { name: 'teacher-Конспект уроку.md' }).first();
    await md.waitFor({ timeout: 30_000 });
    const html = p.getByRole('link', { name: 'teacher-evil.html' }).first();
    await html.waitFor();
    const served = await p.request.get((await html.getAttribute('href'))!);
    const h = served.headers();
    if (h['content-type'] !== 'application/octet-stream' || !/^attachment/.test(h['content-disposition'] ?? '') || h['content-security-policy'] !== 'sandbox') {
      ph.add('lesson-files', 'security', 'major', `HTML lesson file served as ${h['content-type']} / ${h['content-disposition']} / CSP ${h['content-security-policy']}`);
    }
    const mdRes = await p.request.get((await md.getAttribute('href'))!);
    if (mdRes.status() !== 200) ph.add('lesson-files', 'bug', 'major', `md download → ${mdRes.status()}`);
    await files.setInputFiles(FIX('teacher-evil.exe'));
    await pause(1200);
    await ph.snap('lesson-files', { full: false });
  });

  await run('test-all-types', async () => {
    if (!p.url().includes('/builder')) await p.goto(`${BASE}/teacher/courses/${courseId}/builder`);
    const add = structure.getByRole('button', { name: `Додати тест до уроку ${L1}` });
    if (await add.count()) await add.click();
    else await structure.getByRole('button', { name: /^Тест/ }).first().click();
    const editor = p.getByRole('region', { name: 'Редактор тесту' });
    await editor.waitFor();
    await pause(1000);
    // Questions left by an interrupted run come first; number the new ones after them.
    const base = await editor.getByLabel(/^Текст питання \d+$/).count();
    const n = (i: number) => base + i;
    // 1 SINGLE
    const q1 = await addQuestion(p, editor, n(1), 'SINGLE', 'Який тег створює посилання?');
    for (let i = 0; i < 2; i++) await q1.getByRole('button', { name: 'Додати варіант' }).click();
    await q1.getByLabel('Текст варіанта 1').fill('<a>');
    await q1.getByLabel('Текст варіанта 1').blur();
    await q1.getByLabel('Текст варіанта 2').fill('<link>');
    await q1.getByLabel('Текст варіанта 2').blur();
    await q1.getByLabel('Варіант 1 правильний').click();
    // 2 MULTIPLE
    const q2 = await addQuestion(p, editor, n(2), 'MULTIPLE', 'Які теги — заголовки?');
    for (let i = 0; i < 3; i++) await q2.getByRole('button', { name: 'Додати варіант' }).click();
    for (const [i, t] of ['<h1>', '<p>', '<h2>'].entries()) {
      await q2.getByLabel(`Текст варіанта ${i + 1}`).fill(t);
      await q2.getByLabel(`Текст варіанта ${i + 1}`).blur();
    }
    await q2.getByLabel('Варіант 1 правильний').click();
    await q2.getByLabel('Варіант 3 правильний').click();
    // 3 TRUE_FALSE
    const q3 = await addQuestion(p, editor, n(3), 'TRUE_FALSE', 'Тег <br> одиночний.');
    await q3.getByRole('group', { name: `Правильна відповідь на питання ${n(3)}` }).getByText('Правда', { exact: true }).click();
    // 4 SHORT_TEXT
    const q4 = await addQuestion(p, editor, n(4), 'SHORT_TEXT', 'Який атрибут задає адресу посилання?');
    await q4.getByLabel(`Нова прийнятна відповідь для питання ${n(4)}`).fill('href');
    await q4.getByLabel(`Нова прийнятна відповідь для питання ${n(4)}`).press('Enter');
    // 5 NUMERIC
    const q5 = await addQuestion(p, editor, n(5), 'NUMERIC', 'Скільки рівнів заголовків у HTML?');
    await q5.getByLabel(`Правильне значення (питання ${n(5)})`).fill('6');
    await q5.getByLabel(`Правильне значення (питання ${n(5)})`).blur();
    // 6 MATCHING
    const q6 = await addQuestion(p, editor, n(6), 'MATCHING', 'Зіставте тег і призначення');
    for (const [n, l, r] of [[1, '<ul>', 'маркований список'], [2, '<ol>', 'нумерований список']] as const) {
      await q6.getByRole('button', { name: 'Додати пару' }).click();
      await q6.getByLabel(`Пара ${n}: ліворуч`).fill(l);
      await q6.getByLabel(`Пара ${n}: праворуч`).fill(r);
      await q6.getByLabel(`Пара ${n}: праворуч`).blur();
    }
    // 7 ORDERING
    const q7 = await addQuestion(p, editor, n(7), 'ORDERING', 'Розставте теги від зовнішнього до внутрішнього');
    for (const [i, item] of ['<html>', '<body>', '<p>'].entries()) {
      await q7.getByRole('button', { name: 'Додати елемент' }).click();
      await q7.getByLabel(`Елемент ${i + 1}`, { exact: true }).fill(item);
      await q7.getByLabel(`Елемент ${i + 1}`, { exact: true }).blur();
    }
    // 8 ESSAY
    const q8 = await addQuestion(p, editor, n(8), 'ESSAY', 'Поясніть, навіщо потрібен атрибут alt.');
    await q8.getByLabel('Критерії оцінювання (бачать перевіряючі)').fill('Доступність і SEO');
    await q8.getByLabel('Критерії оцінювання (бачать перевіряючі)').blur();
    await pause(1500);
    await ph.snap('test-editor-all-types');
  });

  await run('question-bank-gift', async () => {
    await p.getByRole('tab', { name: 'Банк питань' }).click();
    await pause(800);
    await ph.snap('bank-empty');
    await p.getByLabel('Файл GIFT').setInputFiles(FIX('question-bank.gift'));
    await pause(2500);
    await ph.snap('bank-imported');
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20_000 }), p.getByRole('button', { name: 'Експорт GIFT' }).click()]);
    const file = await dl.path();
    if (!file) ph.add('bank', 'bug', 'minor', 'GIFT export produced no file');
    const back = p.getByRole('tab').filter({ hasText: /Структура|Зміст|Конструктор/ }).first();
    if (await back.count()) await back.click();
  });

  await run('assignment', async () => {
    await p.goto(`${BASE}/teacher/courses/${courseId}/builder`);
    await p.getByRole('button', { name: `Додати завдання до уроку ${L2}` }).click();
    await p.getByLabel('Назва завдання').fill('QA лабораторна: HTML-сторінка');
    await p.getByLabel('Опис і вимоги').fill('<p>Здайте файл <code>index.html</code> і скриншот.</p>');
    const due = new Date(Date.now() + 7 * 864e5);
    const pad = (n: number) => String(n).padStart(2, '0');
    await p.getByLabel('Термін здачі').fill(`${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T18:00`);
    await p.getByLabel('Максимальний бал').fill('10');
    await p.getByLabel('Файлів у роботі').fill('3');
    await p.getByRole('button', { name: 'Зберегти завдання' }).click();
    await toast(p, 'Завдання збережено').waitFor();
    await ph.snap('assignment-saved');
  });

  await run('publish', async () => {
    await p.goto(`${BASE}/teacher/courses/${courseId}/builder`);
    await p.getByRole('button', { name: 'Опублікувати' }).click();
    await pause(2000);
    await ph.snap('published', { full: false });
  });

  await ph.done();
})();
