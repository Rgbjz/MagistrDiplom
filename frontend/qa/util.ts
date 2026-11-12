import type { Page } from '@playwright/test';
import { API, type QA } from './harness';

/** Runs one QA step; a failure is recorded as a bug and the run continues. */
export async function step(qa: QA, page: Page, name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    const msg = (e as Error).message.split('\n')[0].slice(0, 300);
    let shot: string | undefined;
    try {
      shot = await qa.snap(page, `FAIL-${name}`, { axe: false });
    } catch {
      /* ignore */
    }
    qa.add(name, 'bug', 'major', `step failed: ${msg}`, shot);
  }
}

export async function apiJson<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export async function token(email: string, password: string) {
  const r = await apiJson<{ accessToken: string }>('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return r.accessToken;
}

export interface CatalogCourse {
  id: number;
  title: string;
  price: number;
}

export async function catalog(): Promise<CatalogCourse[]> {
  const r = await apiJson<{ items: CatalogCourse[] }>('/store/catalog?pageSize=48');
  return r.items;
}

export async function courseId(title: string) {
  const c = (await catalog()).find((x) => x.title === title);
  if (!c) throw new Error(`course not found: ${title}`);
  return c.id;
}

export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Names the widest elements sticking out of the viewport (horizontal overflow culprits). */
export async function overflowCulprits(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.width > 0) {
        const cls = (el.className && typeof el.className === 'string' ? el.className : '').split(' ')[0];
        out.push(`${el.tagName.toLowerCase()}.${cls} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
      }
    }
    return out.slice(0, 6);
  });
}
