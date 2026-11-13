import { chromium, type Page } from '@playwright/test';
import { BASE, Phase, pause, paceLogin, state } from './h';

type Acc = { email: string; password: string; name: string };
const GROUP = 'QA група (перейменована)';

async function peerLogin(page: Page, acc: Acc) {
  await paceLogin();
  await page.goto(`${BASE}/login?next=/chat`);
  await page.locator('input[type=email]').fill(acc.email);
  await page.locator('input[autocomplete="current-password"]').fill(acc.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
}
const remoteFrames = (pg: Page) =>
  pg.evaluate(() => document.querySelector<HTMLVideoElement>('video[data-peer]')?.videoWidth ?? 0);

(async () => {
  const ph = new Phase('group');
  const p = await ph.attach();
  const { S2, T } = state<{ S2: Acc; T: Acc }>();
  const peerBrowser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const peer = await (await peerBrowser.newContext({ permissions: ['camera', 'microphone'] })).newPage();
  await peerLogin(peer, S2);

  await ph.step('group-remove-member', async () => {
    await p.keyboard.press('Escape');
    await p.goto(`${BASE}/chat`);
    await p.getByRole('complementary', { name: 'Розмови' }).getByRole('button', { name: new RegExp(GROUP.replace(/[()]/g, '.')) }).first().click();
    await p.getByRole('button', { name: 'Учасники й налаштування групи' }).click();
    const settings = p.getByRole('dialog', { name: `Група «${GROUP}»` });
    await settings.getByRole('button', { name: `Видалити з групи: ${T.name}` }).click();
    await pause(600);
    await ph.snap('group-remove-confirm', { full: false });
    await p.getByRole('dialog').last().getByRole('button', { name: /Видалити/ }).last().click();
    await pause(1500);
    await ph.snap('group-member-removed', { full: false });
    await p.keyboard.press('Escape');
    await pause(500);
  });

  await ph.step('group-call-join-banner', async () => {
    const thread = p.getByRole('region', { name: new RegExp(`Розмова: ${GROUP.replace(/[()]/g, '.')}`) });
    await thread.getByRole('button', { name: 'Відеодзвінок', exact: true }).click();
    const win = p.getByRole('dialog', { name: /дзвінок/i });
    await win.waitFor();
    const ring = peer.getByRole('alertdialog');
    await ring.waitFor({ timeout: 20_000 });
    await ring.getByRole('button', { name: 'Відхилити' }).click();
    await peer.goto(`${BASE}/chat`);
    await peer.getByRole('complementary', { name: 'Розмови' }).getByRole('button', { name: /QA група/ }).first().click();
    const join = peer.getByRole('button', { name: 'Приєднатися до дзвінка' });
    await join.waitFor({ timeout: 20_000 });
    await join.click();
    let ok = false;
    for (let i = 0; i < 25 && !ok; i++) {
      ok = (await remoteFrames(p)) > 0;
      if (!ok) await pause(1000);
    }
    if (!ok) ph.add('call', 'bug', 'major', 'group call: the peer who joined from the banner is not received');
    await ph.snap('group-call', { full: false, axe: false });
    await win.getByRole('button', { name: 'Завершити дзвінок' }).click();
    await pause(2500);
    await ph.snap('group-after-call', { full: false });
  });

  await ph.step('dark-chat', async () => {
    await p.getByRole('button', { name: /тему/i }).first().click();
    await pause(600);
    await ph.snap('chat-dark', { full: false });
    await p.getByRole('button', { name: /тему/i }).first().click();
  });

  await peerBrowser.close();
  await ph.done();
})();
