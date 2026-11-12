/**
 * Public runtime configuration. NEXT_PUBLIC_* values are inlined at build time,
 * so they must be set in the Vercel project before deploying (next.config.ts
 * fails the Vercel build when the API URL is missing). The localhost default
 * only exists for local development.
 */
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api'
).replace(/\/$/, '');

/** Backend origin without the /api prefix (sockets, uploaded files). */
export const API_ORIGIN = API_URL.replace(/\/api$/, '');

/** Canonical site URL for absolute links (certificate QR, sharing). */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
