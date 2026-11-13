import { expect, test } from '@playwright/test';
import { catalogAll, failOnPageErrors, login, USERS } from './helpers';

/**
 * Course analytics for the course team, on the seeded «Основи веб-розробки»
 * (students with progress, test attempts and a lab hand-in).
 */

async function webCourseId() {
  const course = (await catalogAll()).find((c) => c.title === 'Основи веб-розробки');
  expect(course).toBeTruthy();
  return course!.id;
}

test('the teacher sees summary, charts, hard questions and students at risk', async ({ page }) => {
  failOnPageErrors(page);
  const id = await webCourseId();
  await login(page, USERS.teacher1, `/courses/${id}`);

  // Reached from the course top bar.
  await page.getByRole('link', { name: 'Аналітика' }).click();
  await expect(page).toHaveURL(new RegExp(`/courses/${id}/analytics$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Аналітика курсу' })).toBeVisible();

  const summary = page.getByRole('region', { name: 'Підсумки курсу' });
  await expect(summary.getByText('Студентів', { exact: true })).toBeVisible();
  await expect(summary.getByText('Середній прогрес')).toBeVisible();

  // Distribution: one bar per percent bucket, each with a spoken label.
  const dist = page.getByRole('list', { name: 'Розподіл підсумкових оцінок' });
  await expect(dist.getByRole('listitem')).toHaveCount(4);
  await expect(dist.getByRole('listitem').first()).toHaveAccessibleName(/^0-59%: \d+ студент/);

  const weeks = page.getByRole('list', { name: 'Активність за тижнями' });
  await expect(weeks.getByRole('listitem')).toHaveCount(12);

  // Hardest questions come from real attempts of the seeded test.
  const hard = page.getByRole('region', { name: 'Найскладніші питання' });
  await expect(hard.getByRole('row')).not.toHaveCount(0);
  await expect(hard.getByRole('cell', { name: 'Тест: як працює веб' }).first()).toBeVisible();

  // Students who need attention: reasons as badges and a «Написати» button.
  const risk = page.getByRole('region', { name: 'Студенти, яким варто приділити увагу' });
  const firstRow = risk.getByRole('row').nth(1);
  await expect(firstRow.getByText(/Низький прогрес|Оцінка нижче порогу|Давно не заходив|Прострочено робіт/).first()).toBeVisible();
  await expect(firstRow.getByRole('button', { name: /^Написати: / })).toBeVisible();

  await expect(page.getByRole('region', { name: 'Тести' }).getByRole('cell', { name: 'Тест: як працює веб' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Практичні та лабораторні' }).getByRole('cell', { name: 'Адаптивна сторінка-каталог' }),
  ).toBeVisible();

  // The same view is a tab in course management.
  await page.goto(`/courses/${id}/manage?tab=analytics`);
  await expect(page.getByRole('tab', { name: 'Аналітика', selected: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Підсумки курсу' })).toBeVisible();
});

test('a student cannot open course analytics', async ({ page }) => {
  const id = await webCourseId();
  await login(page, USERS.student, `/courses/${id}/analytics`);
  await expect(page.getByText('Аналітика доступна лише команді курсу.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Підсумки курсу' })).toHaveCount(0);
});
