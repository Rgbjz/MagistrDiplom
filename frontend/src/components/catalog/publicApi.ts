import type { CatalogResponse, PublicCourse } from '../../lib/types';
import { API_URL } from '../../lib/env';

const BASE = API_URL;

export class PublicApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Unauthenticated GET for the public store endpoints. */
export async function publicGet<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, cache: 'no-store' });
  if (!res.ok) {
    throw new PublicApiError(res.status, `API ${res.status} ${path}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/** Unauthenticated JSON POST used by the auth screens. */
export async function publicPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new PublicApiError(res.status, `API ${res.status} ${path}: ${await res.text()}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface CatalogQuery {
  search?: string;
  category?: string;
  level?: string;
  price?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export function catalogQueryString(q: CatalogQuery): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== '' && v !== null) params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function fetchCatalog(q: CatalogQuery): Promise<CatalogResponse> {
  const qs = catalogQueryString(q);
  return publicGet<CatalogResponse>(`/store/catalog${qs}`);
}

export function fetchPublicCourse(id: number): Promise<PublicCourse> {
  return publicGet<PublicCourse>(`/store/public/courses/${id}`);
}
