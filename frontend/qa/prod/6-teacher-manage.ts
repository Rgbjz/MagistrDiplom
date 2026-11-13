import path from 'node:path';
import { BASE, Phase, pause, state, uiLogin } from './h';

type Acc = { email: string; password: string; name: string };
const FIX = (n: string) => path.join(__dirname, '..', '..', 'e2e', 'fixtures', n);
const LAB = 'QA лабораторна: HTML-сторінка';

(async () => {
  const ph = new Phase('teacher-manage');
  const p = await ph.attach();
  const { T, S1, S2, courseId } = state<{ T: Acc; S1: Acc; S2: Acc; courseId: number }>();

  await uiLogin(ph, T.email, T.password, `/courses/${courseId}/manage?tab=assignments`);

  await ph.step('download-and-return', async () => {
    await pause(1500);
    await ph.snap('assignments-tab');
    const block = p.getByRole('region', { name: LAB });
    const row = block.getByRole('row', { name: new RegExp(S1.name) });
    const link = row.getByRole('link', { name: 'index.html' });
    const res = await p.request.get((await link.getAttribute('href'))!);
    const h = res.headers();
    if (res.status() !== 200 || h['content-type'] !== 'application/octet-stream' || h['content-security-policy'] !== 'sandbox') {
      ph.add('grading', 'security', 'major', `student index.html served as ${res.status()} ${h['content-type']} CSP=${h['content-security-policy']}`);
    }
    const png = await p.request.get((await row.getByRole('link', { name: 'student-avatar.png' }).getAttribute('href'))!);
    if (png.status() !== 200) ph.add('grading', 'bug', 'major', `student png download → ${png.status()}`);
    await row.getByRole('button', { name: 'Перевірити' }).click();
    const dialog = p.getByRole('dialog', { name: `Робота: ${S1.name}` });
    await dialog.waitFor();
    await ph.snap('grade-dialog', { full: false });
    await dialog.getByLabel('Коментар для студента').fill('Додайте, будь ласка, мета-тег viewport і приберіть скрипт.');
    await dialog.getByRole('button', { name: /доопрацювання/i }).click();
    await pause(1500);
    await ph.snap('returned', { full: false });
  });

  await ph.step('student-resubmits', async () => {
    await uiLogin(ph, S1.email, S1.password, `/courses/${courseId}`);
    await p.getByRole('navigation', { name: 'Зміст курсу' }).getByRole('button', { name: /^Завдання: / }).first().click();
    await p.getByRole('heading', { level: 1, name: new RegExp(LAB) }).waitFor();
    await ph.snap('student-sees-return');
    await p.getByLabel('Файли роботи').setInputFiles(FIX('teacher-evil.html'));
    await p.getByLabel('Коментар до роботи').fill('Виправлена версія.');
    await p.getByRole('button', { name: /Здати (повторно|роботу)/ }).click();
    await p.getByText('Роботу здано').first().waitFor({ timeout: 30_000 });
    await ph.snap('student-resubmitted', { full: false });
  });

  await ph.step('grade-with-comment', async () => {
    await uiLogin(ph, T.email, T.password, `/courses/${courseId}/manage?tab=assignments`);
    const row = p.getByRole('region', { name: LAB }).getByRole('row', { name: new RegExp(S1.name) });
    await row.getByRole('button', { name: 'Перевірити' }).click();
    const dialog = p.getByRole('dialog', { name: `Робота: ${S1.name}` });
    await dialog.getByLabel(/Оцінка/).fill('12');
    await pause(400);
    const disabled = await dialog.getByRole('button', { name: 'Оцінити' }).isDisabled();
    if (!disabled) ph.add('grading', 'bug', 'minor', 'score above the maximum (12/10) is accepted');
    await dialog.getByLabel(/Оцінка/).fill('9');
    await dialog.getByLabel('Коментар для студента').fill('Добре! Мінус бал за відсутній опис у meta description.');
    await dialog.getByRole('button', { name: 'Оцінити' }).click();
    await pause(1500);
    await ph.snap('graded');
  });

  await ph.step('essay-review', async () => {
    await p.goto(`${BASE}/courses/${courseId}/manage?tab=tests`);
    await pause(1500);
    await ph.snap('tests-tab');
    const reviews = p.getByRole('region', { name: /Потребує перевірки/ });
    await reviews.getByRole('button', { name: /^Оцінити відповідь/ }).first().click();
    const dlg = p.getByRole('dialog');
    await dlg.getByLabel(/Бали/).fill('1');
    await dlg.getByRole('button', { name: /Зберегти|Оцінити/ }).last().click();
    await pause(1500);
    await ph.snap('essay-graded', { full: false });
  });

  await ph.step('gradebook', async () => {
    await p.goto(`${BASE}/courses/${courseId}/manage?tab=gradebook`);
    await p.getByRole('heading', { name: 'Журнал оцінок' }).waitFor();
    await pause(1500);
    await ph.snap('gradebook');
    const row = p.getByRole('row').filter({ has: p.getByRole('rowheader', { name: new RegExp(S1.name) }) });
    await row.getByRole('button', { name: `Змінити оцінку: ${S1.name}, ${LAB}` }).click();
    const dialog = p.getByRole('dialog', { name: 'Змінити оцінку' });
    await dialog.getByLabel('Нова оцінка').fill('10');
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await pause(500);
    await ph.snap('override-needs-reason', { full: false, axe: false });
    await dialog.getByLabel('Причина зміни').fill('Перездача на консультації');
    await dialog.getByRole('button', { name: 'Зберегти' }).click();
    await pause(1500);
    await ph.snap('gradebook-overridden');
    for (const kind of ['Експорт Excel', 'Експорт CSV']) {
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30_000 }), p.getByRole('button', { name: kind }).click()]);
      if (!(await dl.path())) ph.add('gradebook', 'bug', 'major', `${kind} produced no file`);
    }
  });

  await ph.step('weights-and-ects', async () => {
    await p.goto(`${BASE}/teacher/courses/${courseId}/builder`);
    await p.getByRole('tab', { name: 'Налаштування і ціна' }).click();
    await p.getByLabel('Вага тестів, %').fill('40');
    await pause(300);
    const a = await p.getByLabel('Вага завдань, %').inputValue();
    if (a !== '60') ph.add('settings', 'bug', 'minor', `assignments weight is ${a} after tests=40`);
    await p.getByLabel('Шкала оцінювання').selectOption('ECTS');
    await p.getByRole('group', { name: 'Межі оцінок' }).waitFor();
    await ph.snap('settings-ects');
    await p.getByRole('button', { name: 'Зберегти зміни' }).click();
    await pause(1500);
    await p.goto(`${BASE}/courses/${courseId}/manage?tab=gradebook`);
    await pause(2000);
    await ph.snap('gradebook-ects');
  });

  await ph.step('team-assistant', async () => {
    await p.goto(`${BASE}/courses/${courseId}/manage?tab=team`);
    const invite = p.getByRole('heading', { name: 'Додати до команди' }).locator('xpath=ancestor::form');
    await invite.getByLabel('Email').fill(S2.email);
    await invite.getByLabel('Роль').selectOption('ASSISTANT');
    await invite.getByRole('button', { name: 'Додати' }).click();
    await p.getByRole('row', { name: new RegExp(S2.email) }).waitFor();
    await ph.snap('team');
    await p.getByRole('row', { name: new RegExp(S2.email) }).getByRole('button', { name: new RegExp(`Видалити .* з команди`) }).click();
    await p.getByRole('dialog', { name: 'Видалити з команди?' }).getByRole('button', { name: 'Видалити' }).click();
    await pause(1500);
    await ph.snap('team-removed', { full: false, axe: false });
  });

  await ph.step('students-tab-export', async () => {
    await p.goto(`${BASE}/courses/${courseId}/manage?tab=students`);
    await pause(1500);
    await ph.snap('students');
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30_000 }), p.getByRole('button', { name: 'Експорт CSV' }).click()]);
    if (!(await dl.path())) ph.add('students', 'bug', 'minor', 'students CSV export produced no file');
  });

  await ph.step('analytics', async () => {
    await p.goto(`${BASE}/courses/${courseId}/analytics`);
    await p.getByRole('heading', { level: 1, name: 'Аналітика курсу' }).waitFor();
    await pause(1500);
    await ph.snap('analytics');
    await p.goto(`${BASE}/courses/${courseId}/manage?tab=analytics`);
    await pause(1500);
    await ph.snap('analytics-tab', { axe: false });
  });

  await ph.done();
})();
