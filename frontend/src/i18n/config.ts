/** Supported interface languages. Ukrainian is the default and source of truth. */
export const LOCALES = ['uk', 'en', 'pl'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'uk';

/** Cookie holding the chosen language (next-intl's conventional name). */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export const LOCALE_LABELS: Record<Locale, string> = {
  uk: 'Українська',
  en: 'English',
  pl: 'Polski',
};

/** BCP 47 tags for Intl APIs. */
export const INTL_LOCALE: Record<Locale, string> = {
  uk: 'uk-UA',
  en: 'en-GB',
  pl: 'pl-PL',
};

/**
 * Message namespaces: one JSON file per namespace per locale in
 * src/messages/<locale>/<namespace>.json, merged at request time.
 */
export const NAMESPACES = [
  'common',
  'nav',
  'errors',
  'meta',
  'public',
  'auth',
  'catalog',
  'landing',
  'dashboard',
  'course',
  'test',
  'assignment',
  'grades',
  'certificate',
  'profile',
  'checkout',
  'purchases',
  'notifications',
  'chat',
  'call',
  'teacher',
  'builder',
  'manage',
  'gradebook',
  'admin',
  'states',
  'calendar',
  'video',
] as const;
export type Namespace = (typeof NAMESPACES)[number];

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

/** Best match for an Accept-Language header among supported locales. */
export function matchAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().toLowerCase().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { lang: tag.split('-')[0], q: q ? Number(q.trim().slice(2)) || 0 : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { lang } of ranked) {
    // Russian-speaking browsers in Ukraine get the Ukrainian interface.
    if (lang === 'ru' || lang === 'be') return 'uk';
    if (isLocale(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}
