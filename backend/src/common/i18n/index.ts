import { MESSAGES } from './messages';

export const LOCALES = ['uk', 'en', 'pl'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'uk';

export type MessageKey = keyof (typeof MESSAGES)['uk'];
export type MessageParams = Record<string, string | number>;
/** Any stored/requested language tag; unknown values fall back to Ukrainian. */
export type LocaleInput = string | null | undefined;

/** Text rendered later in the recipient's language. */
export interface LocalizedText {
  key: MessageKey;
  params?: MessageParams;
}

export function normalizeLocale(value: unknown): Locale {
  return LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE;
}

/** Looks up `key` in `locale` (falls back to Ukrainian) and fills `{name}` placeholders. */
export function t(
  locale: LocaleInput,
  key: MessageKey,
  params: MessageParams = {},
): string {
  const dict: Record<string, string> = MESSAGES[normalizeLocale(locale)];
  const template = dict[key] ?? MESSAGES.uk[key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Plain strings pass through; LocalizedText is rendered for `locale`. */
export function render(
  value: string | LocalizedText,
  locale: LocaleInput,
): string;
export function render(
  value: string | LocalizedText | null | undefined,
  locale: LocaleInput,
): string | null;
export function render(
  value: string | LocalizedText | null | undefined,
  locale: LocaleInput,
): string | null {
  if (value == null) return null;
  return typeof value === 'string' ? value : t(locale, value.key, value.params);
}

/** Shorthand for building a LocalizedText. */
export function msg(key: MessageKey, params?: MessageParams): LocalizedText {
  return { key, params };
}
