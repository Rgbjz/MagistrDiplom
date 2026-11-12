/** Follow-up for area 5: QA test with every type + essay grading (same window). */
import { BASE, DEMO, QA } from './harness';
import { loadState, step } from './ta-common';
import { pause } from './util';

async function main() {
  const st = loadState();
  const COURSE: number = st.courseId;
  const qa = new QA('manage2', 'full');
  const s1 = { email: process.argv[2], password: 'qaPass1234' };
  const name1 = 'QA learner';
  await qa.start();
  const ctx = await qa.context();
  const page = await qa.page(ctx, 'manage2');
  page.setDefaultTimeout(15_000);
  const s = (n: string, fn: () => Promise<void>) => step(qa, page, n, fn);
  const go = (u: string) => page.goto(`${BASE}${u}`);
  const as = async (u: { email: string; password: string }) => {
    await ctx.clearCookies();
    await qa.login(page, u.email, u.password);
  };
  const manage = (tab: string) => go(`/courses/${COURSE}/manage?tab=${tab}`);
  await as(s1);
  // ---------- student learns, takes test, hands in work ----------
  await s('student-test', async () => {
    await go(`/courses/${COURSE}`);
    await page.getByRole('navigation', { name: 'Зміст курсу' }).waitFor();
    await qa.snap(page, 'qa-lesson-student');
    const scripts = await page.locator('article script').count();
    if (scripts) qa.add('lesson-html', 'bug', 'critical', `lesson HTML renders ${scripts} <script> tag(s)`);
    await page.getByRole('navigation', { name: 'Зміст курсу' }).getByRole('button', { name: /^Тест/ }).first().click();
    await page.getByRole('button', { name: 'Почати тест' }).click();
    await page.getByRole('timer').waitFor();
    const counter = page.getByText(/^Питання \d+ з \d+$/);
    const total = Number((await counter.textContent())!.match(/з (\d+)/)![1]);
    const next = page.getByRole('button', { name: /^Наступне/ });
    for (let i = 0; i < total; i++) {
      await page.getByText(`Питання ${i + 1} з ${total}`).waitFor();
      const body = await page.locator('main').last().innerText();
      if (/Скільки колонок/.test(body)) {
        await page.getByLabel('Ваша відповідь (число)').fill('12');
      } else if (/Зіставте властивість/.test(body)) {
        await page.getByLabel('gap', { exact: true }).selectOption({ label: 'відступ' });
        await page.getByLabel('order', { exact: true }).selectOption({ label: 'порядок' });
      } else if (/Порядок каскаду/.test(body)) {
        const order = ['Браузер', 'Автор', 'Important'];
        const list = page.getByRole('list', { name: 'Елементи для впорядкування' });
        for (const [target, item] of order.entries()) {
          let at = (await list.locator('li').allInnerTexts()).findIndex((x) => x.includes(item));
          while (at > target) {
            await page.getByRole('button', { name: `Перемістити «${item}» вгору` }).click();
            at--;
          }
        }
        await qa.snap(page, 'test-ordering', { fullPage: false, axe: false });
      } else if (/Поясніть різницю/.test(body)) {
        await page.getByLabel('Ваша відповідь', { exact: true }).fill('Flex працює в одній осі, Grid — у двох; grid для макета сторінки.');
        await qa.snap(page, 'test-essay', { fullPage: false, axe: false });
      } else if (/головна вісь/.test(body)) {
        await page.getByLabel('Ваша відповідь', { exact: true }).fill('Main Axis');
      } else if (/Grid працює у двох/.test(body)) {
        await page.locator('fieldset button[aria-pressed]').filter({ hasText: /Правда/ }).first().click();
      } else if (/вмикає flex/.test(body)) {
        await page.locator('fieldset button[aria-pressed]').filter({ hasText: 'display: flex' }).first().click();
      } else if (/належить до Grid/.test(body)) {
        const opts = await page.locator('fieldset button[aria-pressed]').count();
        await qa.snap(page, 'test-empty-multiple', { fullPage: false, axe: false });
        if (!opts) qa.add('test-empty-multiple', 'bug', 'major', 'published test shows a MULTIPLE question with no options — student cannot answer it');
      }
      if (i < total - 1) await next.click();
    }
    await page.getByRole('button', { name: 'Завершити тест' }).last().click();
    const dlg = page.locator('dialog[open]');
    await pause(600);
    if (await dlg.isVisible().catch(() => false)) {
      await qa.snap(page, 'test-unanswered-confirm', { fullPage: false, axe: false });
      await dlg.getByRole('button', { name: 'Завершити' }).click();
    }
    await page.waitForURL(/\/result$/);
    await qa.snap(page, 'qa-test-result-pending');
  });

  await s('teacher-essay', async () => {
    await as(DEMO.teacher1);
    await manage('tests');
    await qa.snap(page, 'manage-tests');
    const reviews = page.getByRole('region', { name: /Потребує перевірки/ });
    await reviews.getByRole('button', { name: /^Оцінити відповідь/ }).first().click();
    const dialog = page.locator('dialog[open]');
    await qa.snap(page, 'essay-dialog', { fullPage: false });
    await dialog.getByLabel(/^Бали/).fill('5');
    const disabled = await dialog.getByRole('button', { name: 'Зберегти оцінку' }).isDisabled();
    if (!disabled) qa.add('essay-dialog', 'bug', 'major', 'essay score above max is accepted');
    await dialog.getByLabel(/^Бали/).fill('1');
    await dialog.getByLabel('Коментар для студента').fill('Добре, але бракує прикладів.');
    await dialog.getByRole('button', { name: 'Зберегти оцінку' }).click();
    await page.getByText('Оцінку збережено').first().waitFor();
    await page.getByRole('button', { name: 'Результати' }).first().click();
    await pause(800);
    await qa.snap(page, 'test-results-dialog', { fullPage: false });
    await page.keyboard.press('Escape');
  });


  await s('student-sees-essay', async () => {
    await as(s1);
    await go(`/courses/${COURSE}/grades`);
    await qa.snap(page, 'student-grades-after-essay');
    await go(`/courses/${COURSE}`);
    await page.getByRole('navigation', { name: 'Зміст курсу' }).getByRole('button', { name: /^Тест/ }).first().click();
    await pause(800);
    await page.getByRole('link', { name: /Розбір|Результат/ }).first().click().catch(() => undefined);
    await pause(1200);
    await qa.snap(page, 'student-test-result-final');
  });
  void name1;
  await ctx.close();
  await qa.finish();
}
main().catch((e) => { console.error(e); process.exit(1); });
