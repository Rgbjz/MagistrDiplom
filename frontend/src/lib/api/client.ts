'use client';

import { getSession, signOut } from 'next-auth/react';
import type { Session } from 'next-auth';
import { API_URL } from '../env';

const BASE = API_URL;

// A page starts several queries at once. Each getSession() is a request to
// /api/auth/session, and with an expired access token each one would refresh
// it with the same refresh token. Share one in-flight request instead.
let pendingSession: Promise<Session | null> | null = null;
function sharedSession() {
  pendingSession ??= getSession().finally(() => {
    pendingSession = null;
  });
  return pendingSession;
}

export async function clientApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const session = await sharedSession();
  if (session?.error === 'RefreshAccessTokenError') {
    await signOut({ redirectTo: '/login' });
  }
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
