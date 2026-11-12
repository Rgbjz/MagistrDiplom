import { fileUrl } from './format';
import type { Locale } from '../i18n/config';

/** Accept list for the attachment picker; mirrors the backend allow-list. */
export const ATTACHMENT_ACCEPT = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.odt', '.ods', '.odp', '.rtf', '.txt', '.md', '.csv',
  '.zip', '.rar', '.7z',
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.mp3', '.mp4', '.webm',
  '.json', '.sql', '.js', '.ts', '.py', '.java', '.c', '.cpp', '.css',
].join(',');
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

// Unit symbols per locale (data, not UI copy); uk/pl use a decimal comma.
const SIZE_UNITS: Record<Locale, [string, string, string]> = {
  uk: ['Б', 'КБ', 'МБ'],
  en: ['B', 'KB', 'MB'],
  pl: ['B', 'KB', 'MB'],
};

/** "740 Б" / "12 KB" / "1,5 МБ". Pass the UI locale (useLocale()); defaults to uk. */
export function formatFileSize(bytes: number, locale: Locale = 'uk'): string {
  const [b, kb, mb] = SIZE_UNITS[locale] ?? SIZE_UNITS.uk;
  if (bytes < 1024) return `${bytes} ${b}`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ${kb}`;
  const value = (bytes / (1024 * 1024)).toFixed(1);
  return `${locale === 'en' ? value : value.replace('.', ',')} ${mb}`;
}

export type FileKind = 'pdf' | 'doc' | 'sheet' | 'slides' | 'archive' | 'image' | 'media' | 'code' | 'other';

export function fileKind(name: string): FileKind {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md'].includes(ext)) return 'doc';
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return 'sheet';
  if (['ppt', 'pptx', 'odp'].includes(ext)) return 'slides';
  if (['zip', 'rar', '7z'].includes(ext)) return 'archive';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
  if (['mp3', 'mp4', 'webm'].includes(ext)) return 'media';
  if (['json', 'sql', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'css'].includes(ext)) return 'code';
  return 'other';
}

/** A video URL that points at an uploaded file rather than YouTube/Vimeo. */
export function isVideoFile(url: string | null | undefined): boolean {
  if (!url) return false;
  return (
    /\.(mp4|webm)(\?|$)/i.test(url) ||
    url.startsWith('/public/videos/') ||
    // Uploaded videos are served through signed API links.
    /\/files\/lesson-video\/\d+/.test(url)
  );
}

export function videoSrc(url: string): string {
  return fileUrl(url) ?? url;
}
