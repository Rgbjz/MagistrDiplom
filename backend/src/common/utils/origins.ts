/** FRONTEND_URL may hold several comma-separated origins (prod + previews). */
export function allowedOrigins(): string[] {
  return (process.env.FRONTEND_URL ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}
