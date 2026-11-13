import { BASE, Phase, api, pause, state, token, uiLogin } from './h';

type Acc = { email: string; password: string; name: string };

(async () => {
  const ph = new Phase('cleanup');
  const p = await ph.attach();
  const { T, S1, S2, S3, S4, courseId } = state<{ T: Acc; S1: Acc; S2: Acc; S3: Acc; S4: Acc; courseId: number }>();
  const left: string[] = [];

  // 1. QA course — deleted by its owner in the builder.
  await ph.step('delete-qa-course-ui', async () => {
    await uiLogin(ph, T.email, T.password, `/teacher/courses/${courseId}/builder`);
    const structure = p.getByRole('complementary', { name: 'Структура курсу' });
    await structure.getByRole('button', { name: 'Видалити курс' }).click();
    const dlg = p.getByRole('dialog', { name: 'Видалити курс?' });
    await pause(500);
    await ph.snap('delete-course-confirm', { full: false });
    await dlg.getByRole('button', { name: /Видалити/ }).last().click();
    await p.waitForURL((u) => !u.pathname.includes('/builder'), { timeout: 30_000 });
    await pause(1500);
    await ph.snap('course-deleted', { full: false });
    const r = await fetch(`${BASE.replace('magistr-lms.vercel.app', 'lms-backend-z43s.onrender.com')}/api/store/public/courses/${courseId}`);
    if (r.status !== 404) ph.add('cleanup', 'bug', 'major', `deleted course still public: ${r.status}`);
  });

  // 2. Groups: every remaining member leaves (the last one deletes the group).
  await ph.step('leave-groups', async () => {
    for (const u of [S2, S1, T]) {
      const t = await token(u.email, u.password);
      const convs = await api<{ id: number; type: string }[]>('/chat/conversations', t);
      for (const c of convs.filter((x) => x.type === 'GROUP')) {
        await api(`/chat/groups/${c.id}/leave`, t, { method: 'POST' }).catch((e) => left.push(`group ${c.id}: ${e.message}`));
      }
    }
  });

  // 3. Main QA student deletes the account through the profile UI.
  await ph.step('delete-account-ui', async () => {
    await uiLogin(ph, S1.email, S1.password, '/profile');
    const del = p.getByRole('button', { name: 'Видалити акаунт' }).first();
    await del.scrollIntoViewIfNeeded();
    await del.click();
    const dlg = p.getByRole('dialog', { name: 'Видалити акаунт?' });
    const pw = dlg.locator('input[type=password]');
    if (await pw.count()) await pw.fill(S1.password);
    await pause(500);
    await ph.snap('delete-account-confirm', { full: false });
    await dlg.getByRole('button', { name: /Видалити/ }).last().click();
    await p.waitForURL((u) => !u.pathname.startsWith('/profile'), { timeout: 30_000 });
    await pause(1500);
    await ph.snap('account-deleted', { full: false });
  });

  // 4. Other QA accounts via the API.
  await ph.step('delete-other-qa-users', async () => {
    for (const u of [S2, S3, S4, T]) {
      try {
        const t = await token(u.email, u.password);
        await api('/users/me', t, { method: 'DELETE', body: JSON.stringify({ password: u.password }) });
      } catch (e) {
        left.push(`${u.email}: ${(e as Error).message}`);
      }
    }
  });

  console.log('LEFT:', left.length ? left.join('\n') : 'nothing');
  await p.goto(`${BASE}/`);
  await ph.done();
})();
