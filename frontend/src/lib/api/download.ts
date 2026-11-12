'use client';

import { getSession } from 'next-auth/react';
import { API_URL } from '../env';

/** Reads `filename*=UTF-8''…` (RFC 5987) or `filename="…"` from Content-Disposition. */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // fall through to the plain name
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}

/**
 * Downloads an authenticated file: fetch with the Bearer token, then save the
 * blob through a temporary <a download>. Rejects with "API <status> …" like clientApi.
 */
export async function downloadFile(path: string, fallbackName: string): Promise<string> {
  const session = await getSession();
  const token = session?.accessToken;
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`API ${res.status} ${path}: ${await res.text()}`);
  }
  const name = filenameFromDisposition(res.headers.get('Content-Disposition')) ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}
