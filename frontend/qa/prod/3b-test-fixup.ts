import { BASE, Phase, pause, state } from './h';

(async () => {
  const ph = new Phase('teacher-fixup');
  const p = await ph.attach();
  const { courseId } = state<{ courseId: number }>();
  await ph.step('fix-test', async () => {
    await p.goto(`${BASE}/teacher/courses/${courseId}/builder`);
    const structure = p.getByRole('complementary', { name: 'Структура курсу' });
    await structure.getByRole('button', { name: /^Тест/ }).first().click();
    const editor = p.getByRole('region', { name: 'Редактор тесту' });
    await editor.waitFor();
    // Leftover empty «Нове питання» from the interrupted run.
    const leftover = editor.locator('li').filter({ has: p.locator('input[value="Нове питання"]') }).first();
    if (await leftover.count()) {
      await leftover.getByRole('button', { name: /Видалити питання/ }).first().click();
      const dlg = p.getByRole('dialog');
      if (await dlg.count()) await dlg.getByRole('button', { name: /Видалити/ }).click();
      await pause(1500);
    }
    // Matching: re-enter the second pair's right side and wait for the save.
    const n = await editor.getByLabel(/^Пара 2: праворуч$/).count();
    if (n) {
      const right = editor.getByLabel(/^Пара 2: праворуч$/).first();
      await right.fill('нумерований список');
      await right.blur();
      await pause(2500);
    }
    await ph.snap('test-fixed');
  });
  await ph.done();
})();
