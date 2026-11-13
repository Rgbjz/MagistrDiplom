import { BASE, Phase, api, pause, uiLogin } from './h';

(async () => {
  const ph = new Phase('demo');
  const p = await ph.attach();
  const catalog = await api<{ items: { id: number; title: string }[] }>('/store/catalog?pageSize=48');
  const id = (t: string) => catalog.items.find((c) => c.title === t)!.id;
  const web = id('Основи веб-розробки');
  const html = id('HTML з нуля (відеокурс)');

  await uiLogin(ph, 'teacher1@lms.local', 'demo1234');
  await ph.step('teacher1-dashboard', async () => {
    await pause(1500);
    await ph.snap('teacher1-dashboard');
  });
  await ph.step('teacher1-analytics', async () => {
    await p.goto(`${BASE}/courses/${web}/analytics`);
    await p.getByRole('heading', { level: 1, name: 'Аналітика курсу' }).waitFor();
    await pause(1500);
    await ph.snap('analytics-web');
    // «Написати» from the at-risk list opens a direct chat (no message is sent).
    const risk = p.getByRole('region', { name: 'Студенти, яким варто приділити увагу' });
    const btn = risk.getByRole('button', { name: /^Написати: / }).first();
    if (await btn.count()) {
      await btn.click();
      await p.waitForURL(/\/chat\?c=\d+/, { timeout: 20_000 });
      await ph.snap('analytics-write', { full: false });
    }
  });
  await ph.step('teacher1-html-course-gradebook-and-export', async () => {
    await p.goto(`${BASE}/courses/${html}/manage?tab=gradebook`);
    await p.getByRole('heading', { name: 'Журнал оцінок' }).waitFor();
    await pause(1500);
    await ph.snap('gradebook-html');
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30_000 }), p.getByRole('button', { name: 'Експорт Excel' }).click()]);
    if (!(await dl.path())) ph.add('gradebook', 'bug', 'major', 'Excel export failed on the demo course');
    await p.goto(`${BASE}/courses/${html}/manage?tab=assignments`);
    await pause(1500);
    await ph.snap('assignments-html');
    await p.goto(`${BASE}/courses/${html}/analytics`);
    await pause(1500);
    await ph.snap('analytics-html');
  });
  await ph.step('teacher1-builder-readonly', async () => {
    await p.goto(`${BASE}/teacher/courses/${html}/builder`);
    await pause(1500);
    await ph.snap('builder-html');
  });

  await uiLogin(ph, 'student@lms.local', 'demo1234');
  await ph.step('student-dashboard', async () => {
    await pause(1500);
    await ph.snap('student-dashboard');
  });
  await ph.step('student-html-course-lab-and-test', async () => {
    await p.goto(`${BASE}/courses/${html}`);
    await p.getByRole('navigation', { name: 'Зміст курсу' }).waitFor();
    await pause(1500);
    await ph.snap('html-course');
    await p.getByRole('navigation', { name: 'Зміст курсу' }).getByRole('button', { name: /Лабораторна робота 1/ }).first().click();
    await pause(1500);
    await ph.snap('html-lab1-graded');
    await p.getByRole('navigation', { name: 'Зміст курсу' }).getByRole('button', { name: /Тест: основи HTML/ }).first().click();
    await pause(1500);
    await ph.snap('html-test1-intro', { full: false });
    await p.goto(`${BASE}/courses/${html}/grades`);
    await ph.snap('html-grades');
  });
  await ph.step('student-en-pl', async () => {
    for (const [re, lang] of [[/English/, 'en'], [/Polski/, 'pl']] as const) {
      await p.locator('header').first().getByRole('button', { name: /Мова інтерфейсу|Interface language|Język interfejsu/ }).click();
      await p.getByRole('menuitemradio', { name: re }).click();
      await p.waitForFunction((l) => document.documentElement.lang === l, lang);
      await pause(1200);
      await ph.snap(`student-dashboard-${lang}`);
    }
    await p.locator('header').first().getByRole('button', { name: /Język interfejsu/ }).click();
    await p.getByRole('menuitemradio', { name: /Українська/ }).click();
    await p.waitForFunction(() => document.documentElement.lang === 'uk');
  });

  await ph.done();
})();
