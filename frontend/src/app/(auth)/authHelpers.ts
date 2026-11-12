/**
 * Shared bits for the auth screens. When the backend has no SMTP configured
 * (local dev) it returns the e-mail token in the response; we keep it here so
 * the "check your mail" screen can offer a dev shortcut.
 */

const CONFIRM_KEY = 'lms:confirm-token:';

export interface ConfirmMailResponse {
  email: string;
  emailSent: boolean;
  confirmToken?: string;
}

export interface ResetMailResponse {
  emailSent: boolean;
  resetToken?: string | null;
}

export function saveConfirmToken(email: string, token: string | undefined) {
  if (!token) return;
  try {
    sessionStorage.setItem(CONFIRM_KEY + email.toLowerCase(), token);
  } catch {
    // storage unavailable — the demo button simply won't show
  }
}

export function readConfirmToken(email: string): string | null {
  try {
    return sessionStorage.getItem(CONFIRM_KEY + email.toLowerCase());
  } catch {
    return null;
  }
}

/** Only allow same-site relative redirects from ?next=. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

/** 0–4 score used by the password strength hint. */
export function passwordScore(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-zа-яії]/i.test(pw) && /\d/.test(pw)) score++;
  if (/[^a-zа-яіїє0-9]/i.test(pw) || (/[a-z]/.test(pw) && /[A-Z]/.test(pw))) score++;
  return Math.min(score, 4);
}

/** Message keys (auth.password.strength.*) indexed by passwordScore(). */
export const STRENGTH_KEYS = ['s0', 's1', 's2', 's3', 's4'] as const;
