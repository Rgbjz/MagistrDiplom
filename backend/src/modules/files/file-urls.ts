import { createHmac, timingSafeEqual } from 'crypto';

/** Protected file kinds served by GET /api/files/:kind/:id. */
export type FileKind =
  | 'lesson-file'
  | 'lesson-video'
  | 'submission-file'
  // HLS playlists/segments/poster of a LessonVideo (served by /files/hls/…);
  // one signature covers every file of that video for that user.
  | 'lesson-hls';
export const FILE_KINDS: FileKind[] = [
  'lesson-file',
  'lesson-video',
  'submission-file',
];

export type ProtectedFolder = 'lessons' | 'videos' | 'submissions';

const MAX_TTL_S = 2 * 60 * 60;

/**
 * Folder of a file stored by StorageService, if it is one of the protected
 * ones: local `/public/<folder>/<name>` or a Vercel Blob URL `/<folder>/…`.
 */
export function protectedFolder(
  url: string | null | undefined,
): ProtectedFolder | null {
  if (!url) return null;
  const local = /^\/public\/(lessons|videos|submissions)\/[\w.-]+$/.exec(url);
  if (local) return local[1] as ProtectedFolder;
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('.blob.vercel-storage.com')) return null;
    const blob = /^\/(lessons|videos|submissions)\//.exec(u.pathname);
    return blob ? (blob[1] as ProtectedFolder) : null;
  } catch {
    return null;
  }
}

/**
 * Expiry aligned to the hour (1–2 h ahead) so the same user gets the same URL
 * for a while: browsers can cache it and <video> elements don't reload when
 * React Query refetches.
 */
export function expiryFor(nowMs: number): number {
  const hour = 3600;
  return (Math.floor(nowMs / 1000 / hour) + 2) * hour;
}

export function signature(
  secret: string,
  kind: FileKind,
  id: number,
  userId: number,
  exp: number,
) {
  return createHmac('sha256', secret)
    .update(`${kind}:${id}:${userId}:${exp}`)
    .digest('base64url');
}

export function verifySignature(
  secret: string,
  kind: FileKind,
  id: number,
  userId: number,
  exp: number,
  sig: string,
  nowMs = Date.now(),
): boolean {
  const now = Math.floor(nowMs / 1000);
  if (!Number.isInteger(exp) || exp <= now || exp > now + MAX_TTL_S)
    return false;
  const expected = Buffer.from(signature(secret, kind, id, userId, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Parses a single-range `Range: bytes=…` header. */
export function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null | 'invalid' {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid';
  let start: number;
  let end: number;
  if (m[1] === '') {
    // suffix range: last N bytes
    const n = Number(m[2]);
    if (n === 0) return 'invalid';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}

/** Content-Disposition with an RFC 5987 filename* for non-ASCII names. */
export function contentDisposition(name: string, mimeType: string): string {
  const inline =
    mimeType.startsWith('video/') ||
    mimeType.startsWith('audio/') ||
    mimeType === 'application/pdf' ||
    /^image\/(png|jpe?g|gif|webp)$/.test(mimeType);
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
