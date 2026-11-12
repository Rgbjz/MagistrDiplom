/**
 * Area 2 follow-up (same single window): header language select en/pl for a
 * signed-in student, assignment resubmission, modal position check.
 */
import { BASE, QA } from './harness';
import { api, apiToken, fixtures, step } from './ta-common';
import { pause } from './util';

const WEB = 152;

async function main() {
  const f = fixtures();
  const qa = new QA('student-extra', 'full');
  const user = await qa.freshUser('studx');
  await api(`/courses/${WEB}/enroll`, await apiToken(user.email, user.password), { method: 'POST' });
  await qa.start();
  const ctx = await qa.context();
  const page = await qa.page(ctx, 'student-extra');
  page.setDefaultTimeout(15_000);
  const s = (n: string, fn: () => Promise<void>) => step(qa, page, n, fn);

  await s('login', () => qa.login(page, user.email, user.password));

  await s('assignment-resubmit', async () => {
    await page.goto(`${BASE}/courses/${WEB}?assignment=88`);
    const input = page.getByLabel('Файли роботи');
    await input.setInputFiles(f.notes);
    await page.getByRole('button', { name: 'Здати роботу' }).click();
    await page.getByText('Роботу здано').first().waitFor();
    await input.setInputFiles([f.pdf, f.notes]);
    await qa.snap(page, 'assignment-resubmit-selected', { axe: false });
    await page.getByRole('button', { name: 'Здати повторно' }).click();
    await page.getByText('Роботу здано повторно').first().waitFor();
    await qa.snap(page, 'assignment-resubmitted', { axe: false });
  });

  await s('modal-position', async () => {
    await page.goto(`${BASE}/calendar`);
    await page.getByRole('button', { name: 'Підписатися в Google Calendar' }).click();
    await pause(1200);
    const box = await page.locator('dialog[open]').boundingBox();
    const vp = page.viewportSize()!;
    await qa.snap(page, 'modal-position', { axe: false, fullPage: false });
    if (box && box.x < 50 && box.y < 50) {
      qa.add('modal-position', 'bug', 'major', `modal at x=${Math.round(box.x)} y=${Math.round(box.y)} (viewport ${vp.width}×${vp.height}) — not centered`);
    }
    await page.keyboard.press('Escape');
  });

  for (const loc of ['en', 'pl'] as const) {
    await s(`header-lang-${loc}`, async () => {
      await page.goto(`${BASE}/`);
      await page.locator('header select').first().selectOption(loc);
      await pause(2000);
      await qa.snap(page, `${loc}-dashboard`);
      for (const [n, u] of [
        ['course', `/courses/${WEB}?lesson=322`],
        ['assignment', `/courses/${WEB}?assignment=88`],
        ['calendar', '/calendar'],
        ['notifications', '/notifications'],
        ['grades', `/courses/${WEB}/grades`],
        ['profile', '/profile'],
        ['chat', '/chat'],
        ['purchases', '/purchases'],
      ]) {
        await page.goto(`${BASE}${u}`);
        await qa.snap(page, `${loc}-${n}`, { axe: false });
      }
    });
  }
  await s('back-to-uk', async () => {
    await page.goto(`${BASE}/profile`);
    await page.getByRole('radio', { name: 'Українська' }).or(page.getByRole('button', { name: 'Українська', exact: true })).first().click();
    await pause(1500);
    await qa.snap(page, 'profile-uk-again', { axe: false });
  });
  await ctx.close();
  await qa.finish();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
