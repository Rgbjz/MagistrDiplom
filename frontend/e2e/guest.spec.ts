import { expect, test, type Page } from '@playwright/test';
import { failOnPageErrors, uid } from './helpers';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:5055/api';

interface CatalogItem {
  id: number;
  title: string;
  price: number;
  category: string | null;
}

/** Cards shown on the first page (other e2e specs keep adding published courses). */
function onPage(r: { total: number; pageSize: number }) {
  return Math.min(r.total, r.pageSize);
}

async function publicCatalog(query = ''): Promise<{ items: CatalogItem[]; total: number; pageSize: number; categories: string[] }> {
  const res = await fetch(`${API_URL}/store/catalog${query}`);
  return (await res.json()) as { items: CatalogItem[]; total: number; pageSize: number; categories: string[] };
}

/** Registers + confirms a student through the API so guest tests stay independent. */
async function createConfirmedStudent(): Promise<{ email: string; password: string }> {
  const email = `guest-${uid()}@e2e.local`;
  const password = 'Guest-pass-123';
  const reg = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role: 'STUDENT', firstName: 'Гість', lastName: 'Тестовий' }),
  });
  const { confirmToken } = (await reg.json()) as { confirmToken?: string };
  if (!confirmToken) throw new Error('Expected a dev confirm token (SMTP must be off)');
  await fetch(`${API_URL}/auth/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: confirmToken }),
  });
  return { email, password };
}

function resultCards(page: Page) {
  return page.locator('section[aria-live="polite"] a[href^="/c/"]');
}

// Video needs Playwright's ffmpeg build, which isn't installed here.
test.use({ video: 'off' });

test.beforeEach(({ page }) => {
  failOnPageErrors(page);
});

test.describe('Гість: головна сторінка', () => {
  test('показує hero і популярні курси з посиланнями на лендинги', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Реєстрація' }).first()).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Популярні курси' })).toBeVisible();
    const cards = page.locator('main a[href^="/c/"]');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(1);

    const href = await cards.first().getAttribute('href');
    await cards.first().click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole('heading', { name: 'Програма курсу' })).toBeVisible();
  });

  test('блоки «Як це працює», FAQ і посилання на реєстрацію з роллю', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Як це працює' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Часті питання' })).toBeVisible();
    await expect(page.locator('#faq details').first()).toBeVisible();
    await page.locator('a[href="/register?role=TEACHER"]').click();
    await expect(page).toHaveURL(/\/register\?role=TEACHER/);
    await expect(page.getByRole('radio', { name: /Викладач/ })).toBeChecked();
  });
});

test.describe('Гість: каталог', () => {
  test('пошук звужує результати і зберігається в URL', async ({ page }) => {
    const all = await publicCatalog();
    expect(all.total).toBeGreaterThan(1);
    const target = all.items[0];
    const term = target.title.split(' ')[0];

    await page.goto('/catalog');
    await expect(page.getByRole('heading', { name: 'Каталог курсів' })).toBeVisible();
    await expect(resultCards(page).first()).toBeVisible();

    await page.getByRole('searchbox', { name: 'Пошук курсу' }).fill(term);
    await expect(page).toHaveURL(new RegExp(`search=${encodeURIComponent(term)}`));
    await expect(resultCards(page).filter({ hasText: target.title })).toBeVisible();

    const expected = await publicCatalog(`?search=${encodeURIComponent(term)}`);
    await expect(resultCards(page)).toHaveCount(Math.min(expected.total, 12));
    expect(expected.total).toBeLessThan(all.total);

    // The search survives a reload (state lives in the URL).
    await page.reload();
    await expect(page.getByRole('searchbox', { name: 'Пошук курсу' })).toHaveValue(term);
  });

  test('фільтри ціни, категорії, рівня і сортування', async ({ page }) => {
    const all = await publicCatalog();
    const free = await publicCatalog('?price=free');
    const paid = await publicCatalog('?price=paid');

    await page.goto('/catalog');
    await expect(resultCards(page).first()).toBeVisible();

    const filters = page.getByRole('complementary', { name: 'Фільтри' });
    await filters.getByRole('radio', { name: 'Платні' }).click();
    await expect(page).toHaveURL(/price=paid/);
    await expect(resultCards(page)).toHaveCount(onPage(paid));
    await expect(resultCards(page).first()).toContainText('₴');

    await filters.getByRole('radio', { name: 'Безкоштовні' }).click();
    await expect(page).toHaveURL(/price=free/);
    await expect(resultCards(page)).toHaveCount(onPage(free));
    await expect(resultCards(page).first()).toContainText('Безкоштовно');

    await filters.getByRole('radio', { name: 'Усі', exact: true }).click();
    await expect(page).not.toHaveURL(/price=/);
    await expect(resultCards(page)).toHaveCount(onPage(all));

    const category = all.categories[0];
    const byCategory = await publicCatalog(`?category=${encodeURIComponent(category)}`);
    await filters.getByRole('radio', { name: category, exact: true }).click();
    await expect(page).toHaveURL(/category=/);
    await expect(resultCards(page)).toHaveCount(onPage(byCategory));
    await filters.getByRole('radio', { name: 'Усі категорії' }).click();
    await expect(page).not.toHaveURL(/category=/);

    const beginner = await publicCatalog('?level=BEGINNER');
    await filters.getByRole('radio', { name: 'Початковий' }).click();
    await expect(page).toHaveURL(/level=BEGINNER/);
    await expect(resultCards(page)).toHaveCount(onPage(beginner));
    await filters.getByRole('radio', { name: 'Будь-який' }).click();
    await expect(page).not.toHaveURL(/level=/);

    const priceDesc = await publicCatalog('?sort=price_desc');
    await page.getByRole('combobox', { name: 'Сортування' }).selectOption('price_desc');
    await expect(page).toHaveURL(/sort=price_desc/);
    await expect(resultCards(page).first()).toContainText(priceDesc.items[0].title);
  });

  test('порожній результат і скидання фільтрів', async ({ page }) => {
    await page.goto(`/catalog?search=${uid()}-nothing`);
    await expect(page.getByText('Нічого не знайдено')).toBeVisible();
    await page.getByRole('button', { name: 'Скинути фільтри' }).click();
    await expect(page).toHaveURL(/\/catalog$/);
    await expect(resultCards(page).first()).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Пошук курсу' })).toHaveValue('');
  });
});

test.describe('Гість: лендинг курсу', () => {
  test('показує ціну, програму, викладача і веде гостя на реєстрацію/вхід', async ({ page }) => {
    const paid = (await publicCatalog('?price=paid')).items[0];
    await page.goto(`/c/${paid.id}`);
    await expect(page.getByRole('heading', { level: 1, name: paid.title })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Програма курсу' })).toBeVisible();
    await expect(page.getByText('Викладач курсу').first()).toBeVisible();

    const priceCard = page.getByRole('complementary', { name: 'Вартість курсу' });
    await expect(priceCard).toContainText('₴');
    const buy = priceCard.getByRole('link', { name: 'Купити курс' });
    await expect(buy).toHaveAttribute('href', `/register?next=${encodeURIComponent(`/c/${paid.id}`)}`);

    await priceCard.getByRole('link', { name: 'Увійти' }).click();
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(`/c/${paid.id}`)}`));

    await page.goto(`/c/${paid.id}`);
    await buy.click();
    await expect(page).toHaveURL(/\/register\?next=/);
    await expect(page.getByRole('heading', { name: 'Створіть акаунт' })).toBeVisible();
  });

  test('безкоштовний курс пропонує записатися', async ({ page }) => {
    const free = (await publicCatalog('?price=free')).items[0];
    await page.goto(`/c/${free.id}`);
    const priceCard = page.getByRole('complementary', { name: 'Вартість курсу' });
    await expect(priceCard.getByText('Безкоштовно')).toBeVisible();
    await expect(priceCard.getByRole('link', { name: 'Записатися на курс' })).toBeVisible();
  });

  test('неіснуючий курс → 404', async ({ page }) => {
    const res = await page.goto('/c/999999');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Сторінку не знайдено' })).toBeVisible();
  });
});

test.describe('Гість: службові сторінки', () => {
  test('/privacy доступна без входу', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { name: 'Конфіденційність і cookie' })).toBeVisible();
  });

  test('невідомий маршрут показує 404', async ({ page }) => {
    const res = await page.goto(`/welcome/${uid()}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Сторінку не знайдено' })).toBeVisible();
  });

  test('без GA ID банер згоди не показується і сторінка не падає', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Згода на аналітику' })).toHaveCount(0);
    expect(await page.locator('script[src*="googletagmanager"]').count()).toBe(0);
  });

  test('перемикач теми змінює data-theme і запамʼятовує вибір', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    const before = await html.getAttribute('data-theme');
    const toggle = page.getByRole('button', { name: /Увімкнути (світлу|темну) тему/ });
    await toggle.click();
    const after = before === 'dark' ? 'light' : 'dark';
    await expect(html).toHaveAttribute('data-theme', after);
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', after);
  });

  test('захищений маршрут веде на вхід і повертає після входу', async ({ page }) => {
    const user = await createConfirmedStudent();
    await page.goto('/my-courses');
    await expect(page).toHaveURL(/\/login\?next=%2Fmy-courses/);
    await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
    await page.locator('input[autocomplete="current-password"]').fill(user.password);
    await page.getByRole('button', { name: 'Увійти' }).click();
    await expect(page).toHaveURL(/\/my-courses$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
