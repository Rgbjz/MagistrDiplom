/** Teacher: dashboard, course wizard, builder (lesson, video, files, tests, assignment, bank, settings), publish. */
import { expect } from '@playwright/test';
import { BASE, DEMO, QA } from './harness';
import { fixtures, pause, saveState, step } from './ta-common';

(async () => {
  const qa = new QA('teacher', 'full');
  const f = fixtures();
  await qa.start();
  const ctx = await qa.context({ dark: false });
  const page = await qa.page(ctx, 'teacher');
  const title = `QA Курс ${Date.now().toString(36)}`;
  const lessonTitle = 'QA Урок: Flexbox';
  let courseId = 0;

  await step(qa, page, 'dashboard', async () => {
    await qa.login(page, DEMO.teacher1.email, DEMO.teacher1.password);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await qa.snap(page, 'teacher-dashboard');
  });

  await step(qa, page, 'wizard', async () => {
    await page.getByRole('link', { name: 'Створити курс' }).first().click();
    await page.getByRole('button', { name: 'Далі' }).click();
    await expect(page.getByText('Назва має містити щонайменше 3 символи')).toBeVisible();
    await qa.snap(page, 'wizard-validation', { axe: false });
    await page.getByLabel('Назва курсу').fill(title);
    await page.getByLabel('Опис курсу').fill('Курс для ручної QA-перевірки: уроки, відео, тести всіх типів, завдання і журнал.');
    await page.getByLabel('Категорія').selectOption('Програмування');
    await page.getByLabel('Рівень').selectOption({ label: 'Середній' });
    await qa.snap(page, 'wizard-step1');
    await page.getByRole('button', { name: 'Далі' }).click();
    await page.getByLabel('Файл обкладинки').setInputFiles(f.cover);
    await expect(page.getByRole('img', { name: 'Обкладинка курсу' })).toBeVisible();
    await page.getByRole('radio', { name: 'Платний' }).check();
    await page.getByRole('button', { name: 'Далі' }).click();
    await expect(page.getByText('Вкажіть ціну більше 0 ₴')).toBeVisible();
    await qa.snap(page, 'wizard-step2-paid-validation');
    await page.getByRole('radio', { name: 'Безкоштовний' }).check();
    await page.getByRole('radio', { name: 'За схваленням викладача' }).check();
    await page.getByRole('button', { name: 'Далі' }).click();
    await qa.snap(page, 'wizard-step3-summary');
    await page.getByRole('button', { name: 'Зберегти чернетку' }).click();
    await page.waitForURL(/\/teacher\/courses\/\d+\/builder/);
    courseId = Number(/courses\/(\d+)\/builder/.exec(page.url())![1]);
    saveState({ courseId, courseTitle: title, lessonTitle });
    await qa.snap(page, 'builder-empty');
  });

  const structure = page.getByRole('complementary', { name: 'Структура курсу' });

  await step(qa, page, 'builder-lesson', async () => {
    await structure.getByRole('button', { name: 'Додати розділ' }).click();
    await structure.getByRole('button', { name: 'Урок', exact: true }).click();
    await page.getByLabel('Назва уроку').fill(lessonTitle);
    await page.getByLabel('Матеріал уроку').fill(
      '<h2>Flexbox</h2><p>Розкладка в <strong>одну</strong> вісь.</p><pre><code>.row { display: flex; }</code></pre><script>alert(1)</script>',
    );
    await page.getByRole('button', { name: 'Зберегти урок' }).click();
    await expect(page.getByText('Урок збережено').first()).toBeVisible();
    await page.getByLabel('Посилання на відео').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await pause(page, 1200);
    await qa.snap(page, 'builder-lesson-youtube', { axe: false });
  });

  await step(qa, page, 'builder-video-upload', async () => {
    await page.getByRole('button', { name: 'Свій файл' }).click();
    await page.locator('input[type="file"]:not([multiple])[accept*=".mp4"]').setInputFiles(f.video);
    await expect(page.getByText(/Відео завантажено|Обробка відео/).first()).toBeVisible({ timeout: 60_000 });
    await qa.snap(page, 'builder-video-processing', { axe: false });
    await expect(page.getByText('Відео готове до перегляду')).toBeVisible({ timeout: 180_000 });
    await qa.snap(page, 'builder-video-ready');
  });

  await step(qa, page, 'builder-files', async () => {
    const filesInput = page.locator('input[type="file"][multiple]');
    await filesInput.setInputFiles([f.notes, f.pdf]);
    await expect(page.getByRole('link', { name: 'Конспект заняття QA.md' }).first()).toBeVisible({ timeout: 30_000 });
    await filesInput.setInputFiles(f.evil);
    await expect(page.getByText(/qa-evil\.html/).first()).toBeVisible();
    await qa.snap(page, 'builder-files', { axe: false });
    await page.getByRole('button', { name: 'Видалити файл qa-slides.pdf' }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Видалити' }).click();
    await expect(page.getByText('Файл видалено').first()).toBeVisible();
  });

  await step(qa, page, 'builder-test-all-types', async () => {
    await structure.getByRole('button', { name: `Додати тест до уроку ${lessonTitle}` }).click();
    const editor = page.getByRole('region', { name: 'Редактор тесту' });
    await expect(editor).toBeVisible();
    const add = async (n: number, type: string, text: string) => {
      await editor.getByRole('button', { name: 'Додати питання', exact: true }).click();
      const q = editor.getByLabel(`Текст питання ${n}`);
      await q.fill(text);
      await q.blur();
      const card = editor.locator('li').filter({ has: page.getByLabel(`Текст питання ${n}`) });
      if (type !== 'SINGLE') await card.getByLabel(`Тип питання ${n}`).selectOption(type);
      return card;
    };
    const q1 = await add(1, 'SINGLE', 'Яка властивість вмикає flex?');
    for (const _ of [1, 2]) await q1.getByRole('button', { name: 'Додати варіант' }).click();
    await q1.getByLabel('Текст варіанта 1').fill('display: flex');
    await q1.getByLabel('Текст варіанта 1').blur();
    await q1.getByLabel('Текст варіанта 2').fill('float: flex');
    await q1.getByLabel('Текст варіанта 2').blur();
    await q1.getByLabel('Варіант 1 правильний').click();
    await add(2, 'TRUE_FALSE', 'Grid працює у двох вимірах');
    const q3 = await add(3, 'SHORT_TEXT', 'Як називається головна вісь flex?');
    await q3.getByLabel('Нова прийнятна відповідь для питання 3').fill('main axis');
    await q3.getByLabel('Нова прийнятна відповідь для питання 3').press('Enter');
    const q4 = await add(4, 'NUMERIC', 'Скільки колонок у сітці Bootstrap?');
    await q4.getByLabel('Правильне значення (питання 4)').fill('12');
    await q4.getByLabel('Правильне значення (питання 4)').blur();
    const q5 = await add(5, 'MATCHING', 'Зіставте властивість і дію');
    for (const [n, l, r] of [[1, 'gap', 'відступ'], [2, 'order', 'порядок']] as const) {
      await q5.getByRole('button', { name: 'Додати пару' }).click();
      await q5.getByLabel(`Пара ${n}: ліворуч`).fill(l);
      await q5.getByLabel(`Пара ${n}: праворуч`).fill(r);
      await q5.getByLabel(`Пара ${n}: праворуч`).blur();
    }
    const q6 = await add(6, 'ORDERING', 'Порядок каскаду');
    for (const [i, item] of ['Браузер', 'Автор', 'Important'].entries()) {
      await q6.getByRole('button', { name: 'Додати елемент' }).click();
      await q6.getByLabel(`Елемент ${i + 1}`, { exact: true }).fill(item);
      await q6.getByLabel(`Елемент ${i + 1}`, { exact: true }).blur();
    }
    const q7 = await add(7, 'ESSAY', 'Поясніть різницю між flex і grid');
    await q7.getByLabel('Критерії оцінювання (бачать перевіряючі)').fill('Осі, коли що використовувати');
    await q7.getByLabel('Критерії оцінювання (бачать перевіряючі)').blur();
    await add(8, 'MULTIPLE', 'Що належить до Grid?');
    await pause(page, 1500);
    await qa.snap(page, 'builder-test-editor');
  });

  await step(qa, page, 'builder-test-settings', async () => {
    const settings = page.getByRole('region', { name: /Налаштування тесту/ }).or(page.getByText('Налаштування тесту').locator('..'));
    await settings.first().scrollIntoViewIfNeeded();
    await qa.snap(page, 'builder-test-settings', { axe: false, fullPage: false });
  });

  await step(qa, page, 'builder-assignment', async () => {
    await page.getByRole('button', { name: `Додати завдання до уроку ${lessonTitle}` }).click();
    await page.getByLabel('Назва завдання').fill('QA Завдання: сітка каталогу');
    await page.getByLabel('Опис і вимоги').fill('<p>Зверстайте сітку з <code>grid</code>.</p>');
    const due = new Date(Date.now() + 3 * 86_400_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    await page.getByLabel('Термін здачі').fill(`${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T18:00`);
    await page.getByLabel('Максимальний бал').fill('50');
    await page.getByLabel('Файлів у роботі').fill('3');
    await page.getByRole('button', { name: 'Зберегти завдання' }).click();
    await expect(page.getByText('Завдання збережено').first()).toBeVisible();
    await qa.snap(page, 'builder-assignment');
  });

  await step(qa, page, 'builder-bank', async () => {
    await page.goto(`${BASE}/teacher/courses/${courseId}/builder?tab=bank`);
    const bank = page.getByRole('region', { name: 'Банк питань курсу' });
    await expect(bank).toBeVisible();
    await qa.snap(page, 'bank-empty');
    await bank.getByLabel('Файл GIFT').setInputFiles(f.gift);
    await expect(bank.getByRole('status')).toContainText('Імпортовано');
    await qa.snap(page, 'bank-imported');
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      bank.getByRole('button', { name: 'Експорт GIFT' }).click(),
    ]);
    const saved = `${qa.outDir}/export-${dl.suggestedFilename()}`;
    await dl.saveAs(saved);
    qa.add('bank-export', 'note', 'info', `GIFT export saved: ${saved}`);
  });

  await step(qa, page, 'builder-settings-grading', async () => {
    await page.goto(`${BASE}/teacher/courses/${courseId}/builder?tab=settings`);
    await expect(page.getByRole('button', { name: 'Зберегти зміни' })).toBeVisible();
    await qa.snap(page, 'settings');
    const scale = page.getByLabel('Шкала оцінювання');
    await scale.selectOption('ECTS');
    await pause(page, 800);
    await qa.snap(page, 'settings-ects');
    await page.getByRole('button', { name: 'Зберегти зміни' }).click();
    await expect(page.getByText('Налаштування збережено').first()).toBeVisible();
  });

  await step(qa, page, 'publish-landing', async () => {
    await page.getByRole('button', { name: 'Опублікувати' }).click();
    await expect(page.getByText('Курс опубліковано').first()).toBeVisible();
    await qa.snap(page, 'builder-published', { axe: false });
    await page.goto(`${BASE}/c/${courseId}`);
    await qa.snap(page, 'landing-own-course');
  });

  await qa.finish();
})();
