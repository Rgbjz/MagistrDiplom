import { expect, test } from '@playwright/test';
import { api, API_URL, apiToken, failOnPageErrors, login, uid, USERS } from './helpers';

/**
 * Regressions found in the production QA run (2026-11-13):
 * an empty course could be published, and the lesson editor kept the
 * «Свій файл» tab when switching to a lesson that has a YouTube link.
 */

async function createCourse(token: string, title: string) {
  const form = new FormData();
  form.append('title', title);
  form.append('description', 'Курс для перевірки конструктора');
  form.append('price', '0');
  const res = await fetch(`${API_URL}/courses`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return ((await res.json()) as { id: number }).id;
}

test.beforeEach(({ page }) => failOnPageErrors(page));

test('a course without lessons cannot be published', async ({ page }) => {
  const token = await apiToken(USERS.teacher1);
  const id = await createCourse(token, `E2E порожній ${uid()}`);
  try {
    await login(page, USERS.teacher1, `/teacher/courses/${id}/builder`);
    await page.getByRole('button', { name: 'Опублікувати' }).click();
    await expect(page.getByText('Курс не можна опублікувати: додайте хоча б один урок.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Опублікувати' })).toBeVisible();
    const course = await api<{ published: boolean }>(`/courses/${id}`, token);
    expect(course.published).toBe(false);
  } finally {
    await api(`/courses/${id}`, token, { method: 'DELETE' });
  }
});

test('the video tab follows the selected lesson', async ({ page }) => {
  const token = await apiToken(USERS.teacher1);
  const id = await createCourse(token, `E2E відео-вкладка ${uid()}`);
  try {
    const section = await api<{ id: number }>(`/sections/${id}`, token, {
      method: 'POST',
      body: JSON.stringify({ title: 'Модуль' }),
    });
    const withLink = await api<{ id: number }>(`/lessons/${section.id}`, token, {
      method: 'POST',
      body: JSON.stringify({ title: 'Урок з посиланням', content: '<p>.</p>' }),
    });
    await api(`/lessons/${withLink.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
    }).catch(() => undefined);
    await api(`/lessons/${section.id}`, token, {
      method: 'POST',
      body: JSON.stringify({ title: 'Урок без відео', content: '<p>.</p>' }),
    });

    await login(page, USERS.teacher1, `/teacher/courses/${id}/builder`);
    const structure = page.getByRole('complementary', { name: 'Структура курсу' });
    // Switch the second lesson to «Свій файл», then open the lesson with a link.
    await structure.getByRole('button', { name: 'Урок без відео', exact: true }).click();
    await page.getByRole('button', { name: 'Свій файл' }).click();
    await structure.getByRole('button', { name: 'Урок з посиланням', exact: true }).click();
    await expect(page.getByLabel('Назва уроку')).toHaveValue('Урок з посиланням');
    await expect(page.getByLabel('Посилання на відео')).toHaveValue('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  } finally {
    await api(`/courses/${id}`, token, { method: 'DELETE' });
  }
});
