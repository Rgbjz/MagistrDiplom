import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  NAMESPACES,
  isLocale,
  matchAcceptLanguage,
  type Locale,
} from './config';

/** Locale from the cookie, else the browser's Accept-Language, else Ukrainian. */
export async function resolveLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  return matchAcceptLanguage((await headers()).get('accept-language'));
}

async function loadMessages(locale: Locale) {
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const mod = (await import(`../messages/${locale}/${ns}.json`)) as {
        default: Record<string, unknown>;
      };
      return [ns, mod.default] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = await loadMessages(locale);
  // Untranslated keys fall back to Ukrainian instead of showing the key path.
  const fallback = locale === DEFAULT_LOCALE ? null : await loadMessages(DEFAULT_LOCALE);
  return {
    locale,
    messages: fallback ? deepMerge(fallback, messages) : messages,
    timeZone: 'Europe/Kyiv',
  };
});

function deepMerge(base: Record<string, unknown>, over: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const prev = out[key];
    out[key] =
      prev && typeof prev === 'object' && value && typeof value === 'object' && !Array.isArray(value)
        ? deepMerge(prev as Record<string, unknown>, value as Record<string, unknown>)
        : value;
  }
  return out;
}
