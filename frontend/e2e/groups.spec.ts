import { expect, test, type Browser, type Page } from '@playwright/test';
import { API_URL, api, apiToken, failOnPageErrors, login, uid, USERS } from './helpers';

/**
 * Group chats: a student creates a group with a classmate and the teacher of
 * their course, everybody sees messages, then a group voice call that never
 * asks for the camera. Chrome's fake devices stand in for the microphone.
 */
test.use({
  permissions: ['camera', 'microphone'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

test.describe.configure({ mode: 'serial' });

const PASSWORD = 'demo1234';
type Account = { email: string; password: string; id: number; name: string };

async function freshStudent(tag: string): Promise<Account> {
  const email = `e2e-grp-${tag}-${uid()}@lms.local`;
  const lastName = `Група${tag}`;
  const reg = await api<{ confirmToken?: string }>('/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD, role: 'STUDENT', firstName: 'Студент', lastName }),
  });
  if (!reg.confirmToken) throw new Error('No confirmToken: backend must run without SMTP');
  await api('/auth/confirm', undefined, { method: 'POST', body: JSON.stringify({ token: reg.confirmToken }) });
  const user = { email, password: PASSWORD };
  const me = await api<{ id: number }>('/users/me', await apiToken(user));
  return { ...user, id: me.id, name: `Студент ${lastName}` };
}

const state = {} as { a: Account; b: Account; outsider: Account; groupTitle: string; groupId: number };

test.beforeAll(async () => {
  // A course of teacher1 that both students study in: that's what makes them contacts.
  const teacher = await apiToken(USERS.teacher1);
  const form = new FormData();
  form.append('title', `E2E групи ${uid()}`);
  form.append('description', 'Курс для перевірки групових чатів');
  form.append('price', '0');
  form.append('published', 'true');
  form.append('autoApprove', 'true');
  const res = await fetch(`${API_URL}/courses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${teacher}` },
    body: form,
  });
  if (!res.ok) throw new Error(`course: ${res.status}`);
  const courseId = ((await res.json()) as { id: number }).id;

  state.a = await freshStudent('A');
  state.b = await freshStudent('B');
  state.outsider = await freshStudent('X'); // shares no course with A
  for (const s of [state.a, state.b]) {
    await api(`/courses/${courseId}/enroll`, await apiToken(s), { method: 'POST' });
  }
  state.groupTitle = `Команда ${uid()}`;
});

/** Records every getUserMedia request so we can check the camera was never asked for. */
async function spyMedia(page: Page) {
  await page.addInitScript(() => {
    const md = navigator.mediaDevices;
    const original = md.getUserMedia.bind(md);
    (window as unknown as { __gum: MediaStreamConstraints[] }).__gum = [];
    md.getUserMedia = (c?: MediaStreamConstraints) => {
      (window as unknown as { __gum: MediaStreamConstraints[] }).__gum.push(c ?? {});
      return original(c);
    };
  });
}

const askedForCamera = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __gum: MediaStreamConstraints[] }).__gum.some((c) => !!c.video),
  );

async function newPage(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  failOnPageErrors(page);
  await spyMedia(page);
  return { ctx, page };
}

test('a student creates a group with a classmate and the teacher; members chat', async ({ browser }) => {
  const { ctx, page } = await newPage(browser);
  await login(page, state.a, '/chat');

  await page.getByRole('button', { name: 'Нова група' }).click();
  const dialog = page.getByRole('dialog', { name: 'Нова група' });
  await expect(dialog).toBeVisible();

  // Validation: name and members are required.
  await dialog.getByRole('button', { name: 'Створити групу' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Вкажіть назву групи');
  await dialog.getByLabel('Назва групи').fill(state.groupTitle);

  // Somebody from another course can't be found.
  const search = dialog.getByRole('searchbox', { name: /Пошук людей/ });
  await search.fill('ГрупаX');
  await expect(dialog.getByText('Нікого не знайдено.')).toBeVisible();

  await search.fill('ГрупаB');
  await dialog.getByRole('checkbox', { name: new RegExp(state.b.name) }).check();
  await search.fill('Ірина');
  await dialog.getByRole('checkbox', { name: /Ірина Мельник/ }).check();
  await expect(dialog.getByRole('button', { name: `Прибрати ${state.b.name}` })).toBeVisible();
  await dialog.getByRole('button', { name: 'Створити групу' }).click();
  await expect(dialog).toBeHidden();

  const thread = page.getByRole('region', { name: `Розмова: ${state.groupTitle}` });
  await expect(thread).toBeVisible();
  await expect(thread.getByText(/Група · 3 учасники/)).toBeVisible();
  state.groupId = Number(new URL(page.url()).searchParams.get('c'));
  expect(state.groupId).toBeGreaterThan(0);

  // The group is listed under «Групи».
  const list = page.getByRole('complementary', { name: 'Розмови' });
  await expect(list.getByRole('heading', { name: 'Групи' })).toBeVisible();

  await thread.getByRole('textbox', { name: 'Повідомлення' }).fill('Привіт, команда!');
  await thread.getByRole('button', { name: 'Надіслати' }).click();
  await expect(thread.getByRole('log').getByText('Привіт, команда!')).toBeVisible();

  // Classmate and teacher see the message; the outsider can't open the group.
  for (const member of [state.b, USERS.teacher1]) {
    const messages = await api<{ content: string }[]>(
      `/chat/conversations/${state.groupId}/messages`,
      await apiToken(member),
    );
    expect(messages.map((m) => m.content)).toContain('Привіт, команда!');
  }
  await expect(
    api(`/chat/conversations/${state.groupId}/messages`, await apiToken(state.outsider)),
  ).rejects.toThrow(/403/);
  await ctx.close();
});

test('group settings: the owner renames and sees members; a member leaves', async ({ browser }) => {
  const { ctx, page } = await newPage(browser);
  await login(page, state.a, `/chat?c=${state.groupId}`);
  await page.getByRole('button', { name: 'Учасники й налаштування групи' }).click();
  const dialog = page.getByRole('dialog', { name: `Група «${state.groupTitle}»` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('listitem').filter({ hasText: state.b.name })).toBeVisible();
  await expect(dialog.getByText('власник')).toBeVisible();

  state.groupTitle = `${state.groupTitle} 2`;
  await dialog.getByLabel('Назва групи').fill(state.groupTitle);
  await dialog.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByText('Назву змінено')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: `Розмова: ${state.groupTitle}` })).toBeVisible();
  await ctx.close();

  // A non-owner sees no rename field, only «Вийти з групи».
  const other = await newPage(browser);
  await login(other.page, state.b, `/chat?c=${state.groupId}`);
  await other.page.getByRole('button', { name: 'Учасники й налаштування групи' }).click();
  const memberDialog = other.page.getByRole('dialog', { name: `Група «${state.groupTitle}»` });
  await expect(memberDialog.getByLabel('Назва групи')).toHaveCount(0);
  await expect(memberDialog.getByRole('button', { name: /Видалити з групи/ })).toHaveCount(0);
  await other.page.keyboard.press('Escape');
  await other.ctx.close();
});

test('group audio call: everyone joins with the microphone only', async ({ browser }) => {
  const a = await newPage(browser);
  const b = await newPage(browser);
  const teacher = await newPage(browser);
  await login(b.page, state.b);
  await login(teacher.page, USERS.teacher1);
  await login(a.page, state.a, `/chat?c=${state.groupId}`);

  await a.page.getByRole('button', { name: 'Аудіодзвінок', exact: true }).click();
  const aWindow = a.page.getByRole('dialog', { name: /Аудіодзвінок/ });
  await expect(aWindow).toBeVisible();

  for (const p of [b.page, teacher.page]) {
    const ring = p.getByRole('alertdialog');
    await expect(ring).toBeVisible({ timeout: 10_000 });
    await expect(ring).toContainText('Груповий аудіодзвінок');
    await expect(ring).toContainText(state.groupTitle);
    await ring.getByRole('button', { name: 'Прийняти' }).click();
    await expect(p.getByRole('dialog', { name: /Аудіодзвінок/ })).toBeVisible();
  }

  // The caller has both members' audio and shows them as tiles with the camera off.
  await expect
    .poll(
      () =>
        a.page.evaluate(() =>
          [...document.querySelectorAll<HTMLVideoElement>('video[data-peer]')].map((v) => {
            const s = v.srcObject as MediaStream | null;
            return s ? s.getAudioTracks().filter((t) => t.readyState === 'live').length : 0;
          }),
        ),
      { timeout: 20_000 },
    )
    .toEqual([1, 1]);
  await expect(aWindow.getByRole('figure', { name: /Відео:/ })).toHaveCount(2);
  await expect(aWindow.getByRole('img', { name: 'Камеру вимкнено' })).toHaveCount(2);
  await expect(aWindow.getByText('3 з 6 учасників')).toBeVisible();

  // Nobody's browser was asked for the camera.
  for (const p of [a.page, b.page, teacher.page]) expect(await askedForCamera(p)).toBe(false);

  await aWindow.getByRole('button', { name: 'Завершити дзвінок' }).click();
  for (const p of [b.page, teacher.page]) {
    await p.getByRole('dialog', { name: /Аудіодзвінок/ }).getByRole('button', { name: 'Завершити дзвінок' }).click();
  }
  // The call log says it was an audio call.
  const token = await apiToken(state.a);
  await expect
    .poll(async () =>
      (await api<{ content: string }[]>(`/chat/conversations/${state.groupId}/messages`, token)).some((m) =>
        /^Аудіодзвінок завершено/.test(m.content),
      ),
    )
    .toBe(true);
  for (const s of [a, b, teacher]) await s.ctx.close();
});

test('a member who leaves no longer sees the group', async ({ browser }) => {
  const { ctx, page } = await newPage(browser);
  await login(page, state.b, `/chat?c=${state.groupId}`);
  await page.getByRole('button', { name: 'Учасники й налаштування групи' }).click();
  await page.getByRole('button', { name: 'Вийти з групи' }).click();
  const confirm = page.getByRole('dialog', { name: `Вийти з групи «${state.groupTitle}»?` });
  await confirm.getByRole('button', { name: 'Вийти з групи' }).click();
  await expect(page.getByText('Ви вийшли з групи')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Розмови' }).getByText(state.groupTitle)).toHaveCount(0);
  await ctx.close();
});
