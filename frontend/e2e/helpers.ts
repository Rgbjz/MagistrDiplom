import { expect, type Page } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:5055/api';

export const USERS = {
  student: { email: 'student@lms.local', password: 'demo1234' },
  student2: { email: 'student2@lms.local', password: 'demo1234' },
  teacher1: { email: 'teacher1@lms.local', password: 'demo1234' },
  teacher2: { email: 'teacher2@lms.local', password: 'demo1234' },
  admin: { email: 'admin@lms.local', password: 'admin123' },
} as const;

/** Signs in through the real login form and waits for the redirect. */
export async function login(page: Page, user: { email: string; password: string }, next = '/') {
  await page.goto(`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`);
  await page.getByLabel('Email').fill(user.email);
  // The label also wraps the «Забули пароль?» link, so target the input itself.
  await page.locator('input[autocomplete="current-password"]').fill(user.password);
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Меню користувача' }).click();
  await page.getByRole('menuitem', { name: 'Вийти' }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Unique suffix so repeated runs don't collide on emails/titles. */
export function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Backend login for setup/assertions that aren't the subject of a test. */
export async function apiToken(user: { email: string; password: string }): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  if (!res.ok) throw new Error(`login ${user.email}: ${res.status}`);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

export async function api<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Fails the test on uncaught page errors (React crashes, bad JS). */
export function failOnPageErrors(page: Page) {
  page.on('pageerror', (err) => {
    throw new Error(`Page error on ${page.url()}: ${err.message}`);
  });
}

/** Every published course: repeated runs add E2E courses, so one page isn't enough. */
export async function catalogAll<T = { id: number; title: string }>(): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const res = await api<{ items: T[]; total: number }>(`/store/catalog?pageSize=48&page=${page}`);
    items.push(...res.items);
    if (res.items.length === 0 || items.length >= res.total) return items;
  }
}
