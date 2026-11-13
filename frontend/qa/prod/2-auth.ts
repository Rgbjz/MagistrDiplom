import { API, BASE, Phase, api, pause, paceLogin, qaUser, saveState, token, uiLogin } from './h';

const PW = 'qaPass1234';

(async () => {
  const ph = new Phase('auth');
  const p = await ph.attach();
  await ph.ctx.clearCookies();
  const stamp = Date.now().toString(36);

  // Background QA accounts (API): teacher, peer student, lockout, admin-ops.
  const T = await qaUser('teacher', 'TEACHER', 'Тарас', 'Перевіряйко');
  const S2 = await qaUser('peer', 'STUDENT', 'Петро', 'Напарник');
  const S3 = await qaUser('lock', 'STUDENT', 'Лариса', 'Блок');
  const S4 = await qaUser('admin-ops', 'STUDENT', 'Олег', 'Адмінтест');
  saveState({ T, S2, S3, S4 });

  // Main student — registered through the UI.
  const S1 = { email: `qa-student-${stamp}@qa.local`, password: PW, name: 'Світлана Тестова' };
  await ph.step('register-ui', async () => {
    await p.goto(`${BASE}/register`);
    await ph.snap('register');
    await p.getByRole('button', { name: 'Зареєструватися' }).click();
    await pause(500);
    await ph.snap('register-validation', { axe: false, full: false });
    await p.getByRole('group', { name: 'Я реєструюся як' }).getByText('Студент', { exact: true }).click();
    await p.getByRole('textbox', { name: 'Імʼя' }).fill('Світлана');
    await p.getByRole('textbox', { name: 'Прізвище' }).fill('Тестова');
    await p.getByRole('textbox', { name: 'Email' }).fill(S1.email);
    await p.locator('input[autocomplete="new-password"]').first().fill(PW);
    await p.getByRole('checkbox', { name: /Погоджуюся з правилами/ }).check();
    await paceLogin();
    await p.getByRole('button', { name: 'Зареєструватися' }).click();
    await p.getByRole('heading', { name: 'Перевірте пошту' }).waitFor();
    await ph.snap('register-check-mail');
    // Production has no SMTP: the page offers a direct confirmation link.
    const link = p.getByRole('link', { name: 'Підтвердити email' });
    if (await link.count()) {
      ph.add(
        'register',
        'security',
        'critical',
        'Production has no SMTP: the register API returns confirmToken and the UI shows a direct «Підтвердити email» link, so any email address can be registered and "verified" without owning it.',
      );
      await link.click();
      await p.getByRole('heading', { name: 'Email підтверджено' }).waitFor();
      await ph.snap('register-confirmed', { full: false });
    }
    saveState({ S1 });
  });

  await ph.step('wrong-password-and-lockout', async () => {
    await ph.ctx.clearCookies();
    await p.goto(`${BASE}/login`);
    for (let i = 1; i <= 6; i++) {
      await paceLogin();
      await p.locator('input[type=email]').fill(S3.email);
      await p.locator('input[autocomplete="current-password"]').fill(`wrong-${i}`);
      await p.locator('button[type=submit]').click();
      await pause(1500);
      if (i === 1) await ph.snap('login-wrong-password', { full: false });
    }
    const locked = await p.getByRole('alert').filter({ hasText: /заблоковано/ }).count();
    if (!locked) ph.add('lockout', 'bug', 'major', 'no lockout message after 6 wrong passwords');
    await ph.snap('login-locked', { full: false });
  });

  await ph.step('forgot-reset', async () => {
    await p.goto(`${BASE}/forgot-password`);
    await ph.snap('forgot');
    await p.getByRole('textbox', { name: 'Email' }).fill(S4.email);
    await paceLogin();
    await p.getByRole('button', { name: 'Надіслати посилання' }).click();
    await p.getByRole('heading', { name: 'Перевірте пошту' }).waitFor();
    await ph.snap('forgot-sent', { full: false });
    const reset = p.getByRole('link', { name: 'Скинути пароль' });
    if (await reset.count()) {
      ph.add(
        'forgot-password',
        'security',
        'critical',
        'Production has no SMTP: POST /auth/forgot-password returns resetToken in the response (and the UI shows «Скинути пароль»), so anyone who knows an email — e.g. admin@lms.local — can set a new password for that account. Verified only on a QA account.',
      );
      await reset.click();
      await p.waitForURL(/reset-password/);
      const pws = p.locator('input[type=password]');
      await pws.nth(0).fill('qaPass5678');
      if ((await pws.count()) > 1) await pws.nth(1).fill('qaPass5678');
      await p.getByRole('button').filter({ hasText: /пароль|Зберегти/i }).last().click();
      await pause(1500);
      await ph.snap('reset-done', { full: false });
      S4.password = 'qaPass5678';
      saveState({ S4 });
    }
  });

  await ph.step('login-and-sessions', async () => {
    // A second session for S1 (as if from another device), then the UI one.
    await token(S1.email, S1.password).catch(() => undefined);
    await uiLogin(ph, S1.email, S1.password);
    await ph.snap('first-dashboard');
    await p.goto(`${BASE}/profile`);
    await p.getByRole('heading', { name: 'Активні сесії' }).waitFor();
    await p.getByRole('heading', { name: 'Активні сесії' }).scrollIntoViewIfNeeded();
    await ph.snap('profile-sessions');
    const endOthers = p.getByRole('button', { name: /Завершити всі інші/ });
    if (await endOthers.count()) {
      await endOthers.click();
      const confirm = p.getByRole('dialog').getByRole('button', { name: /Завершити/ });
      if (await confirm.count()) await confirm.click();
      await pause(1200);
      await ph.snap('profile-sessions-ended', { axe: false });
    } else ph.add('sessions', 'bug', 'minor', '«Завершити всі інші сесії» button not found');
  });

  await ph.step('logout', async () => {
    await p.goto(`${BASE}/`);
    await p.getByRole('button', { name: /Меню користувача/ }).click();
    await ph.snap('user-menu', { full: false });
    await p.getByRole('menuitem', { name: /Вийти/ }).click();
    await p.waitForURL(/login|welcome|\/$/);
    await ph.snap('after-logout', { full: false });
  });

  console.log('API', API);
  await ph.done();
})();
