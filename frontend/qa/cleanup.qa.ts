/** Area 9 wrap-up: delete every «QA Курс …» course through the builder UI (one window). */
import { BASE, DEMO, QA } from './harness';
import { step } from './ta-common';
import { catalog, pause } from './util';

async function main() {
  const qa = new QA('cleanup', 'full');
  const ids = (await catalog()).filter((c) => c.title.startsWith('QA Курс')).map((c) => c.id);
  await qa.start();
  const ctx = await qa.context();
  const page = await qa.page(ctx, 'cleanup');
  page.setDefaultTimeout(15_000);
  await qa.login(page, DEMO.teacher1.email, DEMO.teacher1.password);
  for (const id of ids) {
    await step(qa, page, `delete-${id}`, async () => {
      await page.goto(`${BASE}/teacher/courses/${id}/builder`);
      await page.getByRole('button', { name: 'Видалити курс' }).click();
      await qa.snap(page, `delete-confirm-${id}`, { fullPage: false, axe: false });
      await page.locator('dialog[open]').getByRole('button', { name: 'Видалити' }).click();
      await page.waitForURL((u) => !u.pathname.includes('/builder'), { timeout: 15_000 });
      await pause(800);
      await qa.snap(page, `after-delete-${id}`, { axe: false });
      const r = await fetch(`${BASE.replace('3055', '5055')}/api/store/courses/${id}`);
      qa.add(`delete-${id}`, 'note', 'info', `public course API after delete → ${r.status}`);
    });
  }
  await page.goto(`${BASE}/catalog`);
  await qa.snap(page, 'catalog-after-cleanup', { axe: false });
  await ctx.close();
  await qa.finish();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
