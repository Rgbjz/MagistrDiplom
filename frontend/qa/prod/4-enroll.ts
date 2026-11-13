import { BASE, Phase, api, pause, state, token, uiLogin } from './h';

type Acc = { email: string; password: string; name: string };

(async () => {
  const ph = new Phase('enroll');
  const p = await ph.attach();
  const { S1, S2, T, courseId, COURSE } = state<{ S1: Acc; S2: Acc; T: Acc; courseId: number; COURSE: string }>();

  await ph.step('student-dashboard-timing', async () => {
    await uiLogin(ph, S1.email, S1.password);
    const t0 = Date.now();
    await p.waitForFunction(() => !document.querySelector('[class*="Skeleton-module"]'), undefined, { timeout: 30_000 }).catch(() => undefined);
    const ms = Date.now() - t0;
    if (ms > 8000) ph.add('dashboard', 'perf', 'minor', `student dashboard skeletons visible for ${ms} ms after login`);
    await ph.snap('dashboard-empty');
  });

  await ph.step('request-enrollment', async () => {
    await p.goto(`${BASE}/catalog?search=${encodeURIComponent('QA курс перевірки')}`);
    await pause(800);
    await ph.snap('catalog-qa-course', { axe: false });
    await p.goto(`${BASE}/c/${courseId}`);
    await ph.snap('landing-qa-course');
    await p.getByRole('button', { name: 'Подати заявку' }).click();
    await pause(1500);
    await ph.snap('request-pending', { full: false });
  });

  await ph.step('peer-request-api', async () => {
    const t2 = await token(S2.email, S2.password);
    await api(`/courses/${courseId}/enroll`, t2, { method: 'POST' });
  });

  await ph.step('teacher-approves', async () => {
    await uiLogin(ph, T.email, T.password, `/courses/${courseId}/manage?tab=requests`);
    await pause(1500);
    await ph.snap('requests');
    for (const s of [S1, S2]) {
      await p.getByRole('button', { name: `Схвалити заявку ${s.name}` }).click();
      await pause(1500);
    }
    await ph.snap('requests-approved', { axe: false });
    await p.getByRole('tab', { name: /Студенти/ }).click();
    await pause(1000);
    await ph.snap('students-tab');
  });

  console.log(COURSE);
  await ph.done();
})();
