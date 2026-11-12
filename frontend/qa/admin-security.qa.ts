/** Areas 7+8: admin panel and security checks, one window / one page (+ phone/dark pass at the end). */
import { API, BASE, DEMO, QA } from './harness';
import { api, apiToken, loadState, step } from './ta-common';
import { pause } from './util';

async function main() {
  const st = loadState();
  const qa = new QA('admin-security', 'full');
  const promo = await qa.freshUser('promote');
  const blocked = await qa.freshUser('blockme');
  const locked = await qa.freshUser('lockme');
  const sec = await qa.freshUser('security');
  const secTok = await apiToken(sec.email, sec.password);
  await api('/courses/152/enroll', secTok, { method: 'POST' });

  await qa.start();
  const ctx = await qa.context();
  const page = await qa.page(ctx, 'admin');
  page.setDefaultTimeout(15_000);
  page.on('dialog', (d) => {
    qa.add('xss', 'bug', 'critical', `JS dialog fired: ${d.message()} @ ${page.url()}`);
    void d.dismiss();
  });
  const s = (n: string, fn: () => Promise<void>) => step(qa, page, n, fn);
  const go = (u: string) => page.goto(`${BASE}${u}`);
  const as = async (u: { email: string; password: string }) => {
    await ctx.clearCookies();
    await qa.login(page, u.email, u.password);
  };
  const users = () => page.getByRole('region', { name: 'Користувачі' });
  const find = async (email: string) => {
    await users().getByPlaceholder('Пошук за email або ім’ям').fill(email);
    const row = users().getByRole('row', { name: new RegExp(email.replace(/[.]/g, '\\.')) });
    await row.waitFor();
    return row;
  };

  // ---------- admin ----------
  await s('admin-overview', async () => {
    await as(DEMO.admin);
    await page.waitForURL(/\/admin/).catch(() => undefined);
    await go('/admin');
    await qa.snap(page, 'admin-users');
    const pager = page.getByRole('navigation', { name: 'Сторінки користувачів' });
    await pager.getByRole('button', { name: 'Далі' }).click();
    await pause(600);
    await qa.snap(page, 'admin-users-page2', { axe: false });
    await pager.getByRole('button', { name: 'Назад' }).click();
    await users().getByRole('combobox').first().selectOption({ label: 'Адміністратор' });
    await pause(800);
    await qa.snap(page, 'admin-filter-admins', { axe: false });
    await users().getByRole('combobox').first().selectOption({ index: 0 });
  });

  await s('admin-promote', async () => {
    const row = await find(promo.email);
    await row.getByLabel('Роль QA promote').selectOption({ label: 'Викладач' });
    await page.getByText('Роль змінено на «Викладач»').first().waitFor();
    await qa.snap(page, 'admin-promoted', { axe: false });
  });

  await s('admin-block', async () => {
    const row = await find(blocked.email);
    await row.getByRole('button', { name: 'Заблокувати' }).click();
    await qa.snap(page, 'admin-block-dialog', { fullPage: false });
    await page.locator('dialog[open]').getByRole('button', { name: 'Заблокувати' }).click();
    await page.getByText('Користувача заблоковано').first().waitFor();
    await qa.snap(page, 'admin-blocked', { axe: false });
  });

  await s('admin-courses-payments', async () => {
    await users().getByPlaceholder('Пошук за email або ім’ям').fill('');
    await page.getByRole('tab', { name: 'Курси' }).click();
    await pause(800);
    await qa.snap(page, 'admin-courses');
    await page.getByRole('tab', { name: 'Платежі' }).click();
    await pause(800);
    await qa.snap(page, 'admin-payments');
  });

  await s('blocked-login', async () => {
    await ctx.clearCookies();
    await go('/login');
    await page.locator('input[type=email]').fill(blocked.email);
    await page.locator('input[autocomplete="current-password"]').fill(blocked.password);
    await page.locator('button[type=submit]').click();
    await page.getByRole('alert').first().waitFor();
    await qa.snap(page, 'blocked-login', { axe: false });
  });

  await s('admin-unblock', async () => {
    await as(DEMO.admin);
    await go('/admin');
    const row = await find(blocked.email);
    await row.getByRole('button', { name: 'Розблокувати' }).click();
    await page.getByText('Користувача розблоковано').first().waitFor();
  });

  await s('promoted-teacher', async () => {
    await as(promo);
    await qa.snap(page, 'promoted-teacher-dashboard');
  });

  // ---------- security ----------
  await s('lockout', async () => {
    await ctx.clearCookies();
    await go('/login');
    for (let i = 1; i <= 6; i++) {
      await page.locator('input[type=email]').fill(locked.email);
      await page.locator('input[autocomplete="current-password"]').fill(`wrong-${i}`);
      await page.locator('button[type=submit]').click();
      await pause(1200);
      if (i === 5 || i === 6) await qa.snap(page, `login-wrong-${i}`, { axe: false });
    }
    await page.locator('input[autocomplete="current-password"]').fill(locked.password);
    await page.locator('button[type=submit]').click();
    await pause(1500);
    await qa.snap(page, 'login-correct-while-locked', { axe: false });
    if (!/\/login/.test(page.url())) qa.add('lockout', 'bug', 'critical', 'correct password accepted right after 6 wrong attempts (no lockout)');
    const txt = await page.getByRole('alert').first().innerText().catch(() => '');
    qa.add('lockout', 'note', 'info', `message after lockout: «${txt}»`);
  });

  await s('file-urls', async () => {
    const course = await api<{ sections: { lessons: { id: number; files?: { url: string }[] }[] }[] }>('/courses/152', secTok);
    const files = course.sections.flatMap((x) => x.lessons).flatMap((l) => l.files ?? []);
    const signed = files[0].url;
    const codes: Record<string, number> = {};
    codes.signed = (await fetch(signed)).status;
    codes.unsigned = (await fetch(signed.split('?')[0])).status;
    codes.forged = (await fetch(signed.replace(/sig=[^&]+/, 'sig=forged'))).status;
    codes.otherUser = (await fetch(signed.replace(/u=\d+/, 'u=1'))).status;
    codes.expired = (await fetch(signed.replace(/exp=\d+/, 'exp=1000'))).status;
    const v = await api<{ video: { url?: string; hlsUrl?: string; playlistUrl?: string } | null }>('/lessons/322/video', secTok).catch(() => ({ video: null }));
    const hls = v.video?.hlsUrl ?? v.video?.playlistUrl ?? v.video?.url;
    if (hls) {
      codes.hlsSigned = (await fetch(hls)).status;
      codes.hlsUnsigned = (await fetch(hls.split('?')[0])).status;
    }
    qa.add('file-urls', 'note', 'info', `status codes ${JSON.stringify(codes)}`);
    for (const k of ['unsigned', 'forged', 'otherUser', 'expired', 'hlsUnsigned'] as const) {
      if (codes[k] !== undefined && codes[k] < 400) qa.add('file-urls', 'bug', 'critical', `${k} file URL returns ${codes[k]}`);
    }
    // outsider (not enrolled) can't read course detail of a paid course
    const r = await fetch(`${API}/courses/157`, { headers: { Authorization: `Bearer ${secTok}` } });
    qa.add('api-tamper', 'note', 'info', `GET /courses/157 as not-enrolled student → ${r.status}`);
    if (r.ok) qa.add('api-tamper', 'bug', 'critical', 'not-enrolled student reads paid course content');
    const t2 = await apiToken(DEMO.teacher2.email, DEMO.teacher2.password);
    const r2 = await fetch(`${API}/courses/${st.courseId}/students/progress`, { headers: { Authorization: `Bearer ${t2}` } });
    qa.add('api-tamper', 'note', 'info', `teacher2 (removed from team) students/progress → ${r2.status}`);
    if (r2.ok) qa.add('api-tamper', 'bug', 'critical', 'teacher removed from team still reads course students');
  });

  await s('url-tampering-ui', async () => {
    await as(sec);
    for (const [n, u] of [
      ['tamper-paid-course', '/courses/157'],
      ['tamper-foreign-result', '/courses/157/tests/999999/result'],
      ['tamper-checkout-missing', '/checkout/999999'],
      ['tamper-grades-not-enrolled', '/courses/157/grades'],
      ['tamper-manage', `/courses/${st.courseId}/manage`],
      ['tamper-lesson-bad-id', '/courses/152?lesson=999999'],
    ]) {
      await go(u);
      await pause(1500);
      await qa.snap(page, n, { axe: false });
    }
  });

  await s('xss-chat', async () => {
    await go('/courses/152');
    await page.getByRole('button', { name: 'Чат курсу' }).first().click();
    await page.waitForURL(/\/chat\?c=\d+/);
    const payload = `<img src=x onerror=alert('xss')> **bold** <script>alert(2)</script>`;
    await page.getByRole('textbox', { name: 'Повідомлення' }).fill(payload);
    await page.getByRole('button', { name: 'Надіслати' }).click();
    await pause(1500);
    const imgs = await page.locator('[aria-live="polite"] img[src="x"]').count();
    if (imgs) qa.add('xss-chat', 'bug', 'critical', 'chat renders raw <img> from message text');
    await qa.snap(page, 'xss-chat', { axe: false });
  });

  await s('session-revoke', async () => {
    // a second session (as if another device) through the API
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-client-user-agent': 'QA Other Device/1.0' },
      body: JSON.stringify(sec),
    });
    const cookie = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('refreshToken='))!.split(';')[0];
    await go('/profile');
    await page.getByRole('heading', { name: 'Активні сесії' }).waitFor();
    await qa.snap(page, 'sessions-before');
    const other = page.getByRole('button', { name: /Завершити/ });
    const n = await other.count();
    await other.last().click();
    const dlg = page.locator('dialog[open]');
    if (await dlg.isVisible().catch(() => false)) await dlg.getByRole('button', { name: /Завершити/ }).click();
    await pause(1500);
    await qa.snap(page, 'sessions-after');
    const after = await page.getByRole('button', { name: /Завершити/ }).count();
    if (after >= n) qa.add('session-revoke', 'bug', 'major', `session count did not drop (${n} → ${after})`);
    const rr = await fetch(`${API}/auth/refresh`, { method: 'POST', headers: { Cookie: cookie } });
    qa.add('session-revoke', 'note', 'info', `refresh with revoked session → ${rr.status}`);
    if (rr.ok) qa.add('session-revoke', 'bug', 'critical', 'revoked session can still refresh tokens');
  });

  await s('logout-revokes', async () => {
    await page.getByRole('button', { name: 'Меню користувача' }).click();
    await page.getByRole('menuitem', { name: /Вийти/ }).click();
    await pause(1500);
    await go('/profile');
    await pause(1000);
    if (!/\/login|\/welcome/.test(page.url())) qa.add('logout', 'bug', 'critical', `after logout /profile opens: ${page.url()}`);
    await qa.snap(page, 'after-logout-profile', { axe: false });
  });

  // ---------- phone + dark admin ----------
  await page.close();
  await ctx.close();
  const mctx = await qa.context({ mobile: true });
  const m = await qa.page(mctx, 'admin-mobile');
  await step(qa, m, 'admin-mobile-dark', async () => {
    await qa.login(m, DEMO.admin.email, DEMO.admin.password);
    await m.goto(`${BASE}/admin`);
    await qa.snap(m, 'm-admin');
    await m.getByRole('tab', { name: 'Курси' }).click();
    await qa.snap(m, 'm-admin-courses');
    await m.setViewportSize({ width: 1440, height: 780 });
    await m.evaluate(() => localStorage.setItem('theme', 'dark'));
    await m.goto(`${BASE}/admin`);
    await qa.snap(m, 'dark-admin');
    await m.evaluate(() => localStorage.setItem('theme', 'light'));
    await mctx.addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: BASE }]);
    await m.goto(`${BASE}/admin`);
    await qa.snap(m, 'admin-locale-cookie-en', { axe: false });
  });
  await mctx.close();
  await qa.finish();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
