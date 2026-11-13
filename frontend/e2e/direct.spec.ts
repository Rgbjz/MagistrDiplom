import { expect, test } from '@playwright/test';
import { api, API_URL, apiToken, catalogAll, failOnPageErrors, login, uid, USERS } from './helpers';

/**
 * Starting a new direct chat: «Нове повідомлення» in the chat list and
 * «Написати» on a course page. Students may write to any teacher and to
 * classmates, not to unrelated students.
 */

const PASSWORD = 'demo1234';

async function freshStudent(tag: string) {
  const email = `e2e-dm-${tag}-${uid()}@lms.local`;
  const reg = await api<{ confirmToken?: string }>('/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD, role: 'STUDENT', firstName: 'Лист', lastName: tag }),
  });
  if (!reg.confirmToken) throw new Error('No confirmToken: backend must run without SMTP');
  await api('/auth/confirm', undefined, {
    method: 'POST',
    body: JSON.stringify({ token: reg.confirmToken }),
  });
  const user = { email, password: PASSWORD };
  const me = await api<{ id: number }>('/users/me', await apiToken(user));
  return { ...user, id: me.id };
}

test('a new student writes to a teacher from «Нове повідомлення»', async ({ page }) => {
  failOnPageErrors(page);
  const student = await freshStudent('new');
  await login(page, student, '/chat');

  // No conversations yet: the empty state offers both actions.
  await page.getByRole('button', { name: 'Нове повідомлення' }).click();
  const dialog = page.getByRole('dialog', { name: 'Нове повідомлення' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Кому написати').fill('Мельник');
  await dialog.getByRole('button', { name: 'Написати: Ірина Мельник' }).click();

  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/chat\?c=\d+/);
  const thread = page.getByRole('region', { name: 'Розмова: Ірина Мельник' });
  await expect(thread).toBeVisible();
  await thread.getByPlaceholder('Напишіть повідомлення…').fill('Добрий день! Маю питання щодо курсу.');
  await thread.getByRole('button', { name: 'Надіслати' }).click();
  await expect(thread.getByText('Добрий день! Маю питання щодо курсу.')).toBeVisible();

  // The teacher sees the new conversation with that message.
  const teacher = await apiToken(USERS.teacher1);
  const list = await api<{ id: number; lastMessage: { content: string } | null }[]>(
    '/chat/conversations',
    teacher,
  );
  const id = Number(new URL(page.url()).searchParams.get('c'));
  expect(list.find((c) => c.id === id)?.lastMessage?.content).toBe('Добрий день! Маю питання щодо курсу.');

  // Opening it again reuses the same conversation.
  await page.getByRole('button', { name: 'Нове повідомлення' }).click();
  await dialog.getByLabel('Кому написати').fill('Мельник');
  await dialog.getByRole('button', { name: 'Написати: Ірина Мельник' }).click();
  await expect(page).toHaveURL(new RegExp(`/chat\\?c=${id}$`));
});

test('«Написати» on a course page opens a chat with its teacher', async ({ page }) => {
  failOnPageErrors(page);
  const student = await freshStudent('landing');
  const course = (await catalogAll()).find((c) => c.title === 'Git і GitHub з нуля');
  expect(course).toBeTruthy();
  await login(page, student, `/c/${course!.id}`);

  await page.getByRole('button', { name: 'Написати: Андрій Бойко' }).click();
  await expect(page).toHaveURL(/\/chat\?c=\d+/);
  await expect(page.getByRole('region', { name: 'Розмова: Андрій Бойко' })).toBeVisible();
});

test('a student cannot cold-message an unrelated student', async () => {
  const a = await freshStudent('a');
  const b = await freshStudent('b');
  const res = await fetch(`${API_URL}/chat/conversations/direct`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await apiToken(a)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: b.id }),
  });
  expect(res.status).toBe(403);

  // …and such students are not offered in the search either.
  const offered = await api<{ id: number }[]>(
    `/chat/contacts?scope=direct&q=${encodeURIComponent(b.email)}`,
    await apiToken(a),
  );
  expect(offered.map((p) => p.id)).not.toContain(b.id);
});
