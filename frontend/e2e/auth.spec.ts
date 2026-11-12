import { expect, test, type Page } from '@playwright/test';
import { failOnPageErrors, uid } from './helpers';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:5055/api';

interface NewUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

function newUser(prefix = 'auth'): NewUser {
  return {
    email: `${prefix}-${uid()}@e2e.local`,
    password: 'Strong-pass-2026',
    firstName: 'Тарас',
    lastName: 'Тестенко',
  };
}

function passwordField(page: Page, autocomplete: 'current-password' | 'new-password' = 'current-password') {
  return page.locator(`input[autocomplete="${autocomplete}"]`);
}

/** Fills and submits the registration form through the UI. */
async function registerViaUi(page: Page, user: NewUser, role: 'Студент' | 'Викладач' = 'Студент') {
  await page.goto('/register');
  // The radio is visually hidden inside a styled card, so click the card.
  await page.getByRole('group', { name: 'Я реєструюся як' }).getByText(role, { exact: true }).click();
  await expect(page.getByRole('radio', { name: new RegExp(role) })).toBeChecked();
  await page.getByRole('textbox', { name: 'Імʼя' }).fill(user.firstName);
  await page.getByRole('textbox', { name: 'Прізвище' }).fill(user.lastName);
  await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
  await passwordField(page, 'new-password').fill(user.password);
  await page.getByRole('checkbox', { name: /Погоджуюся з правилами/ }).check();
  await page.getByRole('button', { name: 'Зареєструватися' }).click();
  await expect(page).toHaveURL(/\/confirm\?email=/);
  await expect(page.getByRole('heading', { name: 'Перевірте пошту' })).toBeVisible();
}

/** Clicks the dev-mode confirm link and lands on the login page. */
async function confirmViaDemoLink(page: Page) {
  await page.getByRole('link', { name: 'Підтвердити email' }).click();
  await expect(page.getByRole('heading', { name: 'Email підтверджено' })).toBeVisible();
  await page.getByRole('link', { name: 'Перейти до входу' }).click();
  await expect(page).toHaveURL(/\/login\?confirmed=1/);
  await expect(page.getByText('Email підтверджено. Тепер можна увійти.')).toBeVisible();
}

async function loginViaUi(page: Page, email: string, password: string) {
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await passwordField(page).fill(password);
  await page.getByRole('button', { name: 'Увійти' }).click();
}

async function registerAndConfirmViaApi(prefix: string): Promise<NewUser> {
  const user = newUser(prefix);
  const reg = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...user, role: 'STUDENT' }),
  });
  const { confirmToken } = (await reg.json()) as { confirmToken?: string };
  if (!confirmToken) throw new Error('Expected a dev confirm token (SMTP must be off)');
  await fetch(`${API_URL}/auth/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: confirmToken }),
  });
  return user;
}

// Video needs Playwright's ffmpeg build, which isn't installed here.
test.use({ video: 'off' });

test.beforeEach(({ page }) => {
  failOnPageErrors(page);
});

test.describe('Реєстрація', () => {
  test('валідація порожніх і некоректних полів', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: 'Зареєструватися' }).click();
    await expect(page.getByText('Вкажіть імʼя')).toBeVisible();
    await expect(page.getByText('Вкажіть прізвище')).toBeVisible();
    await expect(page.getByText('Введіть коректний email')).toBeVisible();
    await expect(page.getByText('Мінімум 8 символів')).toBeVisible();
    await expect(page.getByText('Потрібна згода з правилами')).toBeVisible();

    await page.getByRole('textbox', { name: 'Email' }).fill('not-an-email');
    await page.getByRole('button', { name: 'Зареєструватися' }).click();
    await expect(page.getByText('Введіть коректний email')).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });

  test('підказка надійності пароля реагує на введення', async ({ page }) => {
    await page.goto('/register');
    const pw = passwordField(page, 'new-password');
    await pw.fill('abc');
    await expect(page.getByText('Пароль занадто короткий — мінімум 8 символів.')).toBeVisible();
    await pw.fill('abcdefgh');
    await expect(page.getByText('Слабкий пароль. Додайте цифри або символи.')).toBeVisible();
    await pw.fill('abcdefgh1');
    await expect(page.getByText('Середній пароль. Додайте ще кілька символів.')).toBeVisible();
    await pw.fill('Abcdefgh-12345');
    await expect(page.getByText('Надійний пароль.')).toBeVisible();

    await page.getByRole('button', { name: 'Показати пароль' }).click();
    await expect(pw).toHaveAttribute('type', 'text');
  });

  test('студент: реєстрація → підтвердження email → вхід → кабінет', async ({ page }) => {
    const user = newUser('student');
    await registerViaUi(page, user);
    await expect(page.getByText(user.email)).toBeVisible();
    await confirmViaDemoLink(page);
    await loginViaUi(page, user.email, user.password);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(`, ${user.firstName}`) })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Мої курси', exact: true })).toBeVisible();
  });

  test('вхід до підтвердження: попередження і повторний лист', async ({ page }) => {
    const user = newUser('unconfirmed');
    await registerViaUi(page, user);

    await page.goto('/login');
    await loginViaUi(page, user.email, user.password);
    const alert = page.getByRole('alert').filter({ hasText: 'Email не підтверджено' });
    await expect(alert).toBeVisible();
    await alert.getByRole('button', { name: 'Надіслати лист ще раз' }).click();
    await expect(page).toHaveURL(/\/confirm\?email=/);
    await expect(page.getByRole('heading', { name: 'Перевірте пошту' })).toBeVisible();

    // The resend produced a fresh dev token; confirming with it unlocks login.
    await confirmViaDemoLink(page);
    await loginViaUi(page, user.email, user.password);
    await expect(page).toHaveURL(/\/$/);
  });

  test('викладач: після підтвердження потрапляє в кабінет викладача', async ({ page }) => {
    const user = newUser('teacher');
    await registerViaUi(page, user, 'Викладач');
    await confirmViaDemoLink(page);
    await loginViaUi(page, user.email, user.password);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1, name: /Добрий день/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Створити курс' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Мої курси', exact: true })).toHaveCount(0);
  });

  test('повторна реєстрація з тим самим email', async ({ page }) => {
    const user = await registerAndConfirmViaApi('dup');
    await page.goto('/register');
    await page.getByRole('textbox', { name: 'Імʼя' }).fill('Інший');
    await page.getByRole('textbox', { name: 'Прізвище' }).fill('Користувач');
    await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
    await passwordField(page, 'new-password').fill('Another-pass-1');
    await page.getByRole('checkbox', { name: /Погоджуюся з правилами/ }).check();
    await page.getByRole('button', { name: 'Зареєструватися' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Користувач з таким email вже існує' })).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
  });

  test('недійсне посилання підтвердження', async ({ page }) => {
    await page.goto(`/confirm?token=${uid()}`);
    await expect(page.getByRole('heading', { name: 'Посилання недійсне' })).toBeVisible();
  });
});

test.describe('Вхід і вихід', () => {
  test('неправильний пароль', async ({ page }) => {
    const user = await registerAndConfirmViaApi('wrongpw');
    await page.goto('/login');
    await loginViaUi(page, user.email, 'definitely-wrong');
    await expect(page.getByRole('alert').filter({ hasText: 'Неправильний email або пароль' })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('5 невдалих спроб тимчасово блокують акаунт', async ({ page }) => {
    const user = await registerAndConfirmViaApi('lockout');
    await page.goto('/login');
    const wrong = page.getByRole('alert').filter({ hasText: 'Неправильний email або пароль' });
    for (let i = 0; i < 5; i++) {
      await loginViaUi(page, user.email, `wrong-${i}`);
      await expect(wrong).toBeVisible();
    }
    // Sixth attempt — even with the right password — is refused while locked.
    await loginViaUi(page, user.email, user.password);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Акаунт тимчасово заблоковано через невдалі спроби входу' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('валідація форми входу', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Увійти' }).click();
    await expect(page.getByText('Введіть коректний email')).toBeVisible();
    await expect(page.getByText('Введіть пароль')).toBeVisible();
  });

  test('вихід через меню користувача', async ({ page }) => {
    const user = await registerAndConfirmViaApi('logout');
    await page.goto('/login');
    await loginViaUi(page, user.email, user.password);
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole('button', { name: 'Меню користувача' }).click();
    await expect(page.getByRole('menu')).toContainText(user.email);
    await page.getByRole('menuitem', { name: 'Вийти' }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/my-courses');
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});

test.describe('Відновлення пароля', () => {
  test('скидання пароля: новий працює, старий — ні', async ({ page }) => {
    const user = await registerAndConfirmViaApi('reset');
    const newPassword = 'Brand-new-pass-77';

    await page.goto('/login');
    await page.getByRole('link', { name: 'Забули пароль?' }).click();
    await expect(page.getByRole('heading', { name: 'Відновлення пароля' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
    await page.getByRole('button', { name: 'Надіслати посилання' }).click();
    await expect(page.getByRole('heading', { name: 'Перевірте пошту' })).toBeVisible();
    await expect(page.getByText(/Якщо акаунт з адресою/)).toBeVisible();

    await page.getByRole('link', { name: 'Скинути пароль' }).click();
    await expect(page.getByRole('heading', { name: 'Новий пароль' })).toBeVisible();
    const fields = passwordField(page, 'new-password');
    await fields.nth(0).fill(newPassword);
    await fields.nth(1).fill('mismatch-123');
    await page.getByRole('button', { name: 'Зберегти пароль' }).click();
    await expect(page.getByText('Паролі не збігаються')).toBeVisible();

    await fields.nth(1).fill(newPassword);
    await page.getByRole('button', { name: 'Зберегти пароль' }).click();
    await expect(page).toHaveURL(/\/login\?reset=1/);
    await expect(page.getByText('Пароль змінено. Увійдіть з новим паролем.')).toBeVisible();

    await loginViaUi(page, user.email, user.password);
    await expect(page.getByRole('alert').filter({ hasText: 'Неправильний email або пароль' })).toBeVisible();

    await passwordField(page).fill(newPassword);
    await page.getByRole('button', { name: 'Увійти' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('невідомий email: та сама відповідь, без кнопки скидання', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByRole('textbox', { name: 'Email' }).fill(`nobody-${uid()}@e2e.local`);
    await page.getByRole('button', { name: 'Надіслати посилання' }).click();
    await expect(page.getByRole('heading', { name: 'Перевірте пошту' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Скинути пароль' })).toHaveCount(0);
  });
});
