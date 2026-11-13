import { BASE, Phase, pause, state } from './h';

(async () => {
  const ph = new Phase('student-test');
  const p = await ph.attach();
  const { courseId } = state<{ courseId: number }>();
  const ORDER = ['<html>', '<body>', '<p>'];

  await ph.step('answer-all-types', async () => {
    if (!(await p.getByRole('timer').count())) {
      await p.goto(`${BASE}/courses/${courseId}`);
      await p.getByRole('navigation', { name: 'Зміст курсу' }).getByRole('button', { name: /^Тест/ }).first().click();
      await p.getByRole('button', { name: /Почати тест|Пройти ще раз/ }).first().click();
      await p.getByRole('timer').waitFor();
    }
    const nav = p.getByRole('navigation', { name: 'Навігація по питаннях' });
    for (let i = 1; i <= 10; i++) {
      await nav.getByRole('button', { name: new RegExp(`^Питання ${i}\\b`) }).click();
      await pause(500);
      const region = p.getByRole('region', { name: `Питання ${i} з 10` });
      const kind = (await region.innerText()).split('\n').slice(0, 3).join(' ');
      const opt = (label: string) => region.getByRole('button', { name: new RegExp(`^[A-Z] ${label.replace(/[<>]/g, (c) => c)}$`) });
      if (/Одна правильна/.test(kind)) await opt('<a>').click();
      else if (/Кілька/.test(kind)) {
        await opt('<h1>').click();
        await opt('<h2>').click();
      } else if (/Правда|неправда/i.test(kind) && (await region.getByRole('button', { name: /Правда$/ }).count())) {
        await region.getByRole('button', { name: /Правда$/ }).first().click();
      } else if (await region.getByLabel('Ваша відповідь (число)').count()) await region.getByLabel('Ваша відповідь (число)').fill('6');
      else if (await region.getByRole('list', { name: 'Елементи для впорядкування' }).count()) {
        const list = region.getByRole('list', { name: 'Елементи для впорядкування' });
        for (const [target, item] of ORDER.entries()) {
          const texts = await list.locator('li').allInnerTexts();
          let at = texts.findIndex((x) => x.includes(item));
          while (at > target) {
            await region.getByRole('button', { name: `Перемістити «${item}» вгору` }).click();
            at--;
          }
        }
      } else if (await region.getByLabel('<ul>', { exact: true }).count()) {
        await region.getByLabel('<ul>', { exact: true }).selectOption({ label: 'маркований список' });
        await region.getByLabel('<ol>', { exact: true }).selectOption({ label: 'нумерований список' });
      } else if (await region.getByLabel('Ваша відповідь', { exact: true }).count()) {
        const essay = /alt/.test(kind + (await region.innerText()));
        await region
          .getByLabel('Ваша відповідь', { exact: true })
          .fill(essay ? 'Атрибут alt описує зображення для екранних читачів і пошукових систем.' : 'href');
      } else ph.add(`q${i}`, 'qa', 'info', `could not recognise question ${i}: ${kind}`);
      if (i === 1 || i === 8) await ph.snap(`attempt2-q${i}`, { full: false, axe: i === 1 });
    }
    const done = await p.getByRole('progressbar', { name: 'Відповіді' }).getAttribute('aria-valuenow');
    if (done !== '10') ph.add('test', 'qa', 'info', `progress shows ${done}/10 answered before finishing`);
    await p.getByRole('button', { name: 'Завершити тест' }).last().click();
    const dlg = p.getByRole('dialog');
    if (await dlg.count()) await dlg.getByRole('button', { name: /Завершити/ }).last().click();
    await p.waitForURL(/\/result/, { timeout: 30_000 });
    await pause(1500);
    await ph.snap('attempt2-result');
    const all = p.getByRole('button', { name: /Показати всі/ });
    if (await all.count()) await all.click();
    await ph.snap('attempt2-review', { axe: false });
  });

  await ph.step('ical', async () => {
    await p.goto(`${BASE}/calendar`);
    await p.getByRole('button', { name: 'Підписатися в Google Calendar' }).click();
    await pause(1500);
    const raw = await p.getByTestId('ical-url').inputValue();
    const url = raw.startsWith('webcal:') ? raw.replace(/^webcal:/, 'https:') : raw;
    if (!/^https?:/.test(raw)) ph.add('calendar', 'bug', 'minor', `iCal URL shown in the dialog is not an http(s) link: "${raw.slice(0, 80)}"`);
    const ics = await p.request.get(url);
    const body = await ics.text();
    if (ics.status() !== 200 || !/BEGIN:VCALENDAR/.test(body)) ph.add('calendar', 'bug', 'major', `iCal feed → ${ics.status()}`);
    else if (!/QA лабораторна/.test(body)) ph.add('calendar', 'bug', 'minor', 'iCal feed has no QA assignment deadline');
    await ph.snap('calendar-ical', { full: false });
  });

  await ph.done();
})();
