import type { CourseLevel, EnrollmentStatus, Role } from './types';
import { API_ORIGIN } from './env';
import { INTL_LOCALE, type Locale } from '../i18n/config';

/*
 * Formatting helpers. New code should use the hooks in src/i18n/format.ts
 * (useFormat, useLabels, useApiErrorMessage …), which bind the current locale.
 * The plain functions below default to Ukrainian so unconverted screens keep
 * working; pass `locale` explicitly in server code.
 */


/** Absolute URL for files the backend serves from /public. */
export function fileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith('http') ? path : `${API_ORIGIN}${path}`;
}

/**
 * Thousands grouped by hand: Intl output differs between Node and browser ICU
 * versions (space vs narrow no-break space), which breaks hydration.
 */
export function groupThousands(value: number, locale: Locale = 'uk'): string {
  const sep = locale === 'en' ? ',' : '\u00a0';
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

const FREE: Record<Locale, string> = { uk: 'Безкоштовно', en: 'Free', pl: 'Bezpłatnie' };

/** «1 200 ₴» / «₴1,200»; zero → «Безкоштовно». */
export function formatPrice(price: number, locale: Locale = 'uk'): string {
  if (price <= 0) return FREE[locale];
  const grouped = groupThousands(price, locale);
  return locale === 'en' ? `₴${grouped}` : `${grouped} ₴`;
}

export function formatDate(value: string | Date, locale: Locale = 'uk'): string {
  return new Date(value).toLocaleDateString(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatDateTime(value: string | Date, locale: Locale = 'uk'): string {
  return new Date(value).toLocaleString(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * "5 хв тому", "вчора", "12 березня" (Ukrainian).
 * @deprecated use useFormat().relative() from src/i18n/format.ts
 */
export function formatRelative(value: string | Date): string {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'щойно';
  if (min < 60) return `${min} хв тому`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} год тому`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'вчора';
  if (days < 7) return `${days} дн тому`;
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

/**
 * Ukrainian plural: plural(5, ['урок', 'уроки', 'уроків']).
 * @deprecated use ICU plurals in messages: t('count.lessons', { count })
 */
export function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export function displayName(
  profile: { firstName?: string | null; lastName?: string | null } | null | undefined,
  fallback: string,
): string {
  const name = `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim();
  return name || fallback;
}

export function initials(name: string): string {
  const parts = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?').concat(parts[1]?.[0] ?? '').toUpperCase();
}

/** @deprecated use useLabels().role() */
export const ROLE_LABEL: Record<Role, string> = {
  STUDENT: 'Студент',
  TEACHER: 'Викладач',
  ADMIN: 'Адміністратор',
};

/** @deprecated use useLabels().level() */
export const LEVEL_LABEL: Record<CourseLevel, string> = {
  BEGINNER: 'Початковий',
  INTERMEDIATE: 'Середній',
  ADVANCED: 'Просунутий',
};

/** @deprecated use useLabels().enrollment() */
export const ENROLLMENT_LABEL: Record<EnrollmentStatus, string> = {
  PENDING: 'Очікує',
  ACTIVE: 'Активний',
  REJECTED: 'Відхилено',
  COMPLETED: 'Завершив',
};

/** Backend/network error → key in the `errors` namespace (null if unknown). */
export type ApiErrorKey =
  | 'invalidCredentials' | 'emailNotConfirmed' | 'accountBlocked' | 'accountLocked'
  | 'rateLimited' | 'userExists' | 'wrongPassword' | 'invalidLink' | 'linkExpired'
  | 'alreadyPurchased' | 'fileTooLarge' | 'unsupportedFile' | 'tooManyLessonFiles'
  | 'alreadyGraded' | 'tooManyFiles' | 'atLeastOneFile' | 'scoreOutOfRange'
  | 'assignmentExists' | 'forbidden' | 'notFound' | 'network';

const ERROR_PATTERNS: [RegExp, ApiErrorKey][] = [
  [/Invalid email or password/i, 'invalidCredentials'],
  [/Email not confirmed/i, 'emailNotConfirmed'],
  [/Account blocked/i, 'accountBlocked'],
  [/API 423|temporarily locked/i, 'accountLocked'],
  [/API 429|Too Many Requests/i, 'rateLimited'],
  [/User already exists/i, 'userExists'],
  [/Wrong password/i, 'wrongPassword'],
  [/Invalid or used/i, 'invalidLink'],
  [/expired/i, 'linkExpired'],
  [/Already purchased/i, 'alreadyPurchased'],
  [/API 413|File too large/i, 'fileTooLarge'],
  [/Unsupported (file|video) type/i, 'unsupportedFile'],
  [/at most \d+ files/i, 'tooManyLessonFiles'],
  [/already graded/i, 'alreadyGraded'],
  [/At most \d+ files can be submitted|Too many files/i, 'tooManyFiles'],
  [/At least one file/i, 'atLeastOneFile'],
  [/Score must be between/i, 'scoreOutOfRange'],
  [/Assignment already exists/i, 'assignmentExists'],
  [/API 403/, 'forbidden'],
  [/API 404/, 'notFound'],
  [/Failed to fetch|NetworkError/i, 'network'],
];

export function apiErrorKey(err: unknown): ApiErrorKey | null {
  const raw = err instanceof Error ? err.message : String(err);
  for (const [re, key] of ERROR_PATTERNS) if (re.test(raw)) return key;
  return null;
}

const UK_ERRORS: Record<ApiErrorKey, string> = {
  invalidCredentials: 'Неправильний email або пароль',
  emailNotConfirmed: 'Email не підтверджено',
  accountBlocked: 'Акаунт заблоковано адміністратором',
  accountLocked: 'Акаунт тимчасово заблоковано через невдалі спроби входу. Спробуйте через 15 хвилин.',
  rateLimited: 'Забагато спроб. Спробуйте за хвилину.',
  userExists: 'Користувач з таким email вже існує',
  wrongPassword: 'Неправильний поточний пароль',
  invalidLink: 'Посилання недійсне або вже використане',
  linkExpired: 'Термін дії посилання минув',
  alreadyPurchased: 'Курс уже придбано',
  fileTooLarge: 'Файл завеликий',
  unsupportedFile: 'Такий тип файлу не підтримується',
  tooManyLessonFiles: 'До уроку можна додати не більше 20 файлів',
  alreadyGraded: 'Роботу вже оцінено — повторно здати не можна',
  tooManyFiles: 'Забагато файлів для цього завдання',
  atLeastOneFile: 'Додайте хоча б один файл',
  scoreOutOfRange: 'Оцінка поза допустимим діапазоном',
  assignmentExists: 'До цього уроку вже додано завдання',
  forbidden: 'Немає доступу',
  notFound: 'Не знайдено',
  network: 'Немає зʼєднання з сервером',
};

/**
 * Error text from clientApi ("API 400 /path: {...message}") → Ukrainian text.
 * @deprecated use useApiErrorMessage() from src/i18n/format.ts
 */
export function apiErrorMessage(err: unknown, fallback = 'Щось пішло не так. Спробуйте ще раз.'): string {
  const key = apiErrorKey(err);
  return key ? UK_ERRORS[key] : fallback;
}

/**
 * "Тест «X»", unless the title already starts with "Тест".
 * @deprecated use useTestLabels().label()
 */
export function testLabel(title: string): string {
  return /^тест/i.test(title.trim()) ? title : `Тест «${title}»`;
}

/**
 * "Тест: X", unless the title already starts with "Тест".
 * @deprecated use useTestLabels().short()
 */
export function testShort(title: string): string {
  return /^тест/i.test(title.trim()) ? title : `Тест: ${title}`;
}

/**
 * "Залишилось 3 дні" / "Термін минув" for an assignment deadline.
 * @deprecated use useDeadline()
 */
export function deadlineLabel(dueAt: string | null | undefined): { text: string; overdue: boolean } | null {
  if (!dueAt) return null;
  const ms = new Date(dueAt).getTime() - Date.now();
  if (ms < 0) return { text: 'Термін минув', overdue: true };
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) {
    const hours = Math.max(1, Math.floor(ms / 3_600_000));
    return { text: `Залишилось ${hours} ${plural(hours, ['година', 'години', 'годин'])}`, overdue: false };
  }
  return { text: `Залишилось ${days} ${plural(days, ['день', 'дні', 'днів'])}`, overdue: false };
}
