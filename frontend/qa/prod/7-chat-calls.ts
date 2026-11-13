import { chromium, type Page } from '@playwright/test';
import { BASE, Phase, pause, paceLogin, saveState, state, uiLogin } from './h';

type Acc = { email: string; password: string; name: string };

async function peerLogin(page: Page, acc: Acc) {
  await paceLogin();
  await page.goto(`${BASE}/login?next=/chat`);
  await page.locator('input[type=email]').fill(acc.email);
  await page.locator('input[autocomplete="current-password"]').fill(acc.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
}

const remoteFrames = (pg: Page) =>
  pg.evaluate(() => {
    const v = document.querySelector<HTMLVideoElement>('video[data-peer]');
    return v ? v.videoWidth : 0;
  });

(async () => {
  const ph = new Phase('chat-calls');
  const only = process.env.ONLY?.split(',');
  const run = (name: string, fn: () => Promise<void>) =>
    only && !only.includes(name) ? Promise.resolve() : ph.step(name, fn);
  const p = await ph.attach();
  const { S1, S2, T, COURSE } = state<{ S1: Acc; S2: Acc; T: Acc; COURSE: string }>();

  // Peer: a separate headless browser (no extra window on screen).
  const peerBrowser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const peerCtx = await peerBrowser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 1280, height: 800 } });
  const peer = await peerCtx.newPage();

  await uiLogin(ph, S1.email, S1.password, '/chat');
  await peerLogin(peer, S2);

  await run('course-chat', async () => {
    await pause(1500);
    await ph.snap('chat-list');
    await p.getByRole('complementary', { name: 'Розмови' }).getByRole('button', { name: new RegExp(COURSE.slice(0, 20)) }).first().click();
    const thread = p.getByRole('region', { name: /Розмова:/ });
    await thread.getByRole('textbox', { name: 'Повідомлення' }).fill('Привіт! Це перевірка чату курсу.');
    await thread.getByRole('button', { name: 'Надіслати' }).click();
    await thread.getByRole('log').getByText('Привіт! Це перевірка чату курсу.').waitFor();
    await ph.snap('course-chat');
  });

  await run('direct-new-message', async () => {
    await p.getByRole('button', { name: 'Нове повідомлення' }).click();
    const dlg = p.getByRole('dialog', { name: 'Нове повідомлення' });
    await dlg.getByLabel('Кому написати').fill('Напарник');
    await pause(1200);
    await ph.snap('new-message-dialog', { full: false });
    await dlg.getByRole('button', { name: `Написати: ${S2.name}` }).click();
    const thread = p.getByRole('region', { name: `Розмова: ${S2.name}` });
    await thread.waitFor();
    await thread.getByRole('textbox', { name: 'Повідомлення' }).fill('Петре, перевіримо дзвінок?');
    await thread.getByRole('button', { name: 'Надіслати' }).click();
    await thread.getByRole('log').getByText('Петре, перевіримо дзвінок?').waitFor();
    // Peer receives it in real time (socket).
    await peer.goto(`${BASE}/chat`);
    await peer.getByText('Петре, перевіримо дзвінок?').first().waitFor({ timeout: 20_000 }).catch(() => ph.add('chat', 'bug', 'major', 'peer did not receive the direct message'));
    saveState({ dmUrl: p.url() });
  });

  await run('video-call-1to1', async () => {
    const thread = p.getByRole('region', { name: `Розмова: ${S2.name}` });
    await thread.getByRole('button', { name: 'Відеодзвінок', exact: true }).click();
    const win = p.getByRole('dialog', { name: /Відеодзвінок/ });
    await win.waitFor();
    await ph.snap('call-calling', { full: false, axe: false });
    const ring = peer.getByRole('alertdialog');
    await ring.waitFor({ timeout: 20_000 });
    await ring.getByRole('button', { name: 'Прийняти' }).click();
    await peer.getByRole('dialog', { name: /Відеодзвінок/ }).waitFor();
    let ok = false;
    for (let i = 0; i < 30 && !ok; i++) {
      ok = (await remoteFrames(p)) > 0 && (await remoteFrames(peer)) > 0;
      if (!ok) await pause(1000);
    }
    if (!ok) ph.add('call', 'bug', 'critical', 'video call connected but remote video has no frames (TURN/ICE?)');
    await ph.snap('call-connected', { full: false, axe: false });
    await win.getByRole('button', { name: 'Вимкнути мікрофон' }).click();
    await pause(1500);
    const muted = await peer.getByRole('img', { name: 'Мікрофон вимкнено' }).count();
    if (!muted) ph.add('call', 'bug', 'minor', 'mute indicator not shown on the other side');
    await win.getByRole('button', { name: 'Вимкнути камеру' }).click();
    await pause(1000);
    await ph.snap('call-camera-off', { full: false, axe: false });
    await win.getByRole('button', { name: 'Вимкнути камеру' }).click();
    const share = await win.getByRole('button', { name: /Демонстрац/ }).count();
    if (!share) ph.add('call', 'bug', 'minor', 'no screen-share button in the call window');
    await win.getByRole('button', { name: 'Завершити дзвінок' }).click();
    await win.waitFor({ state: 'hidden' });
    await pause(2500);
    await ph.snap('call-ended-log', { full: false });
  });

  await run('audio-call-then-camera', async () => {
    const thread = p.getByRole('region', { name: `Розмова: ${S2.name}` });
    await thread.getByRole('button', { name: 'Аудіодзвінок', exact: true }).click();
    const win = p.getByRole('dialog', { name: /Аудіодзвінок/ });
    await win.waitFor();
    const ring = peer.getByRole('alertdialog');
    await ring.waitFor({ timeout: 20_000 });
    if (!/аудіодзвінок/i.test(await ring.innerText())) ph.add('call', 'bug', 'minor', 'incoming card does not say it is an audio call');
    await ring.getByRole('button', { name: 'Прийняти' }).click();
    await pause(4000);
    // Camera is off in an audio call; there must be no local video track.
    const camPressed = await win.getByRole('button', { name: 'Вимкнути камеру' }).getAttribute('aria-pressed');
    if (camPressed !== 'true') ph.add('call', 'bug', 'minor', `audio call starts with camera aria-pressed=${camPressed}`);
    await ph.snap('audio-call', { full: false, axe: false });
    // Turn the camera on mid-call: the peer should start receiving video.
    await win.getByRole('button', { name: 'Вимкнути камеру' }).click();
    let ok = false;
    for (let i = 0; i < 20 && !ok; i++) {
      ok = (await remoteFrames(peer)) > 0;
      if (!ok) await pause(1000);
    }
    if (!ok) ph.add('call', 'bug', 'major', 'camera turned on mid audio call is not received by the peer');
    await ph.snap('audio-call-camera-on', { full: false, axe: false });
    await win.getByRole('button', { name: 'Завершити дзвінок' }).click();
    await pause(2000);
  });

  await run('group-create-and-manage', async () => {
    await p.getByRole('button', { name: 'Нова група' }).click();
    const dlg = p.getByRole('dialog', { name: 'Нова група' });
    await dlg.getByRole('button', { name: 'Створити групу' }).click();
    await pause(400);
    await ph.snap('group-validation', { full: false, axe: false });
    await dlg.getByLabel('Назва групи').fill('QA група перевірки');
    const search = dlg.getByRole('searchbox', { name: /Пошук людей/ });
    await search.fill('Напарник');
    await pause(1200);
    await dlg.getByRole('checkbox', { name: new RegExp(S2.name) }).check();
    await search.fill('Перевіряйко');
    await pause(1200);
    await dlg.getByRole('checkbox', { name: new RegExp(T.name) }).check();
    await ph.snap('group-dialog', { full: false });
    await dlg.getByRole('button', { name: 'Створити групу' }).click();
    const thread = p.getByRole('region', { name: 'Розмова: QA група перевірки' });
    await thread.waitFor();
    await thread.getByRole('textbox', { name: 'Повідомлення' }).fill('Привіт, група!');
    await thread.getByRole('button', { name: 'Надіслати' }).click();
    await thread.getByRole('log').getByText('Привіт, група!').waitFor();
    await p.getByRole('button', { name: 'Учасники й налаштування групи' }).click();
    const settings = p.getByRole('dialog', { name: 'Група «QA група перевірки»' });
    await settings.getByLabel('Назва групи').fill('QA група (перейменована)');
    await settings.getByRole('button', { name: 'Зберегти' }).click();
    await pause(1200);
    await ph.snap('group-settings', { full: false });
    // Remove the teacher from the group (icon button with an accessible name).
    await settings.getByRole('button', { name: `Видалити з групи: ${T.name}` }).click();
    const confirm = p.getByRole('dialog').filter({ hasText: T.name }).last();
    await confirm.getByRole('button', { name: /Видалити/ }).last().click();
    await pause(1500);
    await ph.snap('group-member-removed', { full: false, axe: false });
    await p.keyboard.press('Escape');
    saveState({ group: 'QA група (перейменована)' });
  });

  await run('group-call-join-banner', async () => {
    const thread = p.getByRole('region', { name: /Розмова: QA група/ });
    await thread.getByRole('button', { name: 'Відеодзвінок', exact: true }).click();
    const win = p.getByRole('dialog', { name: /дзвінок/i });
    await win.waitFor();
    // Peer dismisses the ring and joins from the banner in the group chat.
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
    if (!ok) ph.add('call', 'bug', 'major', 'group call: joined peer video not received');
    await ph.snap('group-call', { full: false, axe: false });
    await win.getByRole('button', { name: 'Завершити дзвінок' }).click();
    await pause(2000);
    await ph.snap('group-after-call', { full: false });
  });

  await run('dark-chat', async () => {
    await p.getByRole('button', { name: /тему/i }).first().click();
    await pause(600);
    await ph.snap('chat-dark', { full: false });
    await p.getByRole('button', { name: /тему/i }).first().click();
  });

  await peerBrowser.close();
  await ph.done();
})();
