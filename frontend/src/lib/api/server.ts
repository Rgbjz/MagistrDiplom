import { auth } from '../../auth';
import { API_URL } from '../env';

const BASE = API_URL;

export async function serverApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const session = await auth();
  const token = session?.accessToken;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status} ${path}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
