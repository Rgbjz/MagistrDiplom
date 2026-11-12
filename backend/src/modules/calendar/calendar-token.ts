import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Personal iCal feed token: `<userId>.<version>.<hmac>`. Stable (calendar apps
 * keep polling the same URL) and revocable — bumping the user's
 * calendarTokenVersion invalidates every older URL.
 */
export function signCalendarToken(
  secret: string,
  userId: number,
  version: number,
): string {
  const payload = `${userId}.${version}`;
  const mac = createHmac('sha256', secret)
    .update(`calendar:${payload}`)
    .digest('base64url')
    .slice(0, 32);
  return `${payload}.${mac}`;
}

/** Parses and verifies a token; returns null when malformed or forged. */
export function parseCalendarToken(
  secret: string,
  token: string | undefined | null,
): { userId: number; version: number } | null {
  if (!token) return null;
  const m = /^(\d+)\.(\d+)\.([\w-]{32})$/.exec(token);
  if (!m) return null;
  const userId = Number(m[1]);
  const version = Number(m[2]);
  const expected = signCalendarToken(secret, userId, version);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { userId, version };
}
