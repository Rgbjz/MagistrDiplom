/** Area 6: video calls (direct accept / decline / banner join, course online lesson). Two short-lived contexts. */
import type { Page } from '@playwright/test';
import { BASE, DEMO, QA } from './harness';
import { api, apiToken, loadState, step } from './ta-common';
import { pause } from './util';

async function remoteVideo(page: Page) {
  for (let i = 0; i < 40; i++) {
    const w = await page.evaluate(() => document.querySelector<HTMLVideoElement>('video[data-peer]')?.videoWidth ?? 0);
    if (w > 0) return w;
    await pause(500);
  }
  return 0;
}

async function main() {
  const st = loadState();
  const qa = new QA(process.env.ONLY_LESSON ? 'calls-lesson' : 'calls', 'full');
  const stud = await qa.freshUser('caller');
  const sTok = await apiToken(stud.email, stud.password);
  const me = await api<{ id: number }>('/users/me', sTok);
  const tTok = await apiToken(DEMO.teacher1.email, DEMO.teacher1.password);
  const direct = await api<{ id: number }>('/chat/conversations/direct', tTok, { method: 'POST', body: JSON.stringify({ userId: me.id }) });
  const courseConv = await api<{ id: number }>(`/chat/courses/${st.courseId}/conversation`, tTok);
  const learner = { email: process.argv[2], password: 'qaPass1234' };
  if (learner.email) await api(`/chat/courses/${st.courseId}/conversation`, await apiToken(learner.email, learner.password)).catch(() => undefined);

  await qa.start();
  const tctx = await qa.context();
  const t = await qa.page(tctx, 'calls-teacher');
  t.setDefaultTimeout(20_000);
  await qa.login(t, DEMO.teacher1.email, DEMO.teacher1.password);
  const sctx = await qa.context();
  const s = await qa.page(sctx, 'calls-student');
  s.setDefaultTimeout(20_000);
  await qa.login(s, stud.email, stud.password);
  const call = (p: Page) => p.getByRole('dialog', { name: /Відеодзвінок/ });

  if (!process.env.ONLY_LESSON) await step(qa, t, 'direct-accept', async () => {
    await t.goto(`${BASE}/chat?c=${direct.id}`);
    await t.getByRole('button', { name: 'Відеодзвінок', exact: true }).click();
    await call(t).getByText('Виклик… очікуємо відповіді').waitFor();
    await qa.snap(t, 'teacher-calling', { fullPage: false });
    const ring = s.getByRole('alertdialog');
    await ring.waitFor();
    await qa.snap(s, 'student-ringing', { fullPage: false });
    await ring.getByRole('button', { name: 'Прийняти' }).click();
    const wt = await remoteVideo(t);
    const ws = await remoteVideo(s);
    if (!wt || !ws) qa.add('direct-accept', 'bug', 'major', `remote video missing: teacher sees ${wt}px, student sees ${ws}px`);
    await call(t).getByRole('button', { name: 'Вимкнути мікрофон' }).click();
    await call(t).getByRole('button', { name: 'Вимкнути камеру' }).click().catch(() => undefined);
    await pause(1500);
    await qa.snap(t, 'teacher-in-call', { fullPage: false });
    await qa.snap(s, 'student-in-call-peer-muted', { fullPage: false });
    await call(t).getByRole('button', { name: 'Завершити дзвінок' }).click();
    await call(s).waitFor({ state: 'hidden', timeout: 15_000 });
    await pause(1000);
    await qa.snap(t, 'thread-call-ended');
  });

  if (!process.env.ONLY_LESSON) await step(qa, t, 'direct-decline', async () => {
    await t.getByRole('button', { name: 'Відеодзвінок', exact: true }).click();
    await s.getByRole('alertdialog').getByRole('button', { name: 'Відхилити' }).click();
    await t.getByText('Співрозмовник відхилив дзвінок').first().waitFor();
    await qa.snap(t, 'call-declined', { fullPage: false });
    await pause(1500);
  });

  if (!process.env.ONLY_LESSON) await step(qa, s, 'banner-join', async () => {
    await s.goto(`${BASE}/chat?c=${direct.id}`);
    await t.getByRole('button', { name: 'Відеодзвінок', exact: true }).click().catch(async () => {
      await t.goto(`${BASE}/chat?c=${direct.id}`);
      await t.getByRole('button', { name: 'Відеодзвінок', exact: true }).click();
    });
    await s.getByRole('alertdialog').waitFor();
    const join = s.getByRole('button', { name: 'Приєднатися до дзвінка' });
    await join.waitFor({ timeout: 25_000 });
    await qa.snap(s, 'student-call-banner', { fullPage: false });
    await join.click();
    await call(s).waitFor();
    await remoteVideo(s);
    await qa.snap(s, 'student-joined-via-banner', { fullPage: false });
    await call(s).getByRole('button', { name: 'Завершити дзвінок' }).click();
    await call(t).waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => qa.add('banner-join', 'note', 'minor', 'teacher window stays open after the only peer hangs up'));
    await qa.snap(t, 'teacher-after-peer-left', { fullPage: false, axe: false });
    if (await call(t).isVisible().catch(() => false)) await call(t).getByRole('button', { name: 'Завершити дзвінок' }).click();
  });

  if (learner.email) {
    await step(qa, t, 'online-lesson', async () => {
      await sctx.clearCookies();
      await qa.login(s, learner.email, learner.password);
      await s.goto(`${BASE}/courses/${st.courseId}`);
      await t.goto(`${BASE}/courses/${st.courseId}`);
      await qa.snap(t, 'course-page-teacher', { fullPage: false });
      await t.getByRole('button', { name: 'Онлайн-заняття' }).first().click();
      await call(t).waitFor();
      const ring = s.getByRole('alertdialog');
      await ring.waitFor();
      await qa.snap(s, 'student-online-lesson-invite', { fullPage: false });
      await ring.getByRole('button', { name: 'Прийняти' }).click();
      await remoteVideo(t);
      await pause(1500);
      await qa.snap(t, 'online-lesson-teacher', { fullPage: false });
      await qa.snap(s, 'online-lesson-student', { fullPage: false });
      await call(t).getByRole('button', { name: 'Завершити дзвінок' }).click();
      await pause(2000);
      await qa.snap(s, 'online-lesson-after-teacher-left', { fullPage: false, axe: false });
      if (await call(s).isVisible().catch(() => false)) await call(s).getByRole('button', { name: 'Завершити дзвінок' }).click();
      await t.goto(`${BASE}/chat?c=${courseConv.id}`);
      await qa.snap(t, 'course-chat-after-lesson');
    });
  }
  await sctx.close();
  await tctx.close();
  await qa.finish();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
