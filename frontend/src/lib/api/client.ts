'use client';

import { getSession } from 'next-auth/react';
import { API_URL } from '../env';

const BASE = API_URL;

export async function clientApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const session = await getSession();
  const token = session?.accessToken;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status} ${path}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
