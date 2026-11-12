'use client';

import { Globe } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { LOCALES, LOCALE_LABELS, type Locale } from '../../i18n/config';
import { useChangeLocale } from '../../i18n/useChangeLocale';
import { Segmented } from '../ui';
import styles from './Header.module.scss';

/** Compact language picker for the dark header (native select: accessible on every device). */
export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const t = useTranslations('nav.language');
  const { change, pending } = useChangeLocale();

  return (
    <label className={styles.language} title={t('label')}>
      <Globe size={18} aria-hidden="true" />
      <span className="sr-only">{t('label')}</span>
      <select
        className={styles.languageSelect}
        value={locale}
        disabled={pending}
        onChange={(e) => void change(e.target.value as Locale)}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Segmented language choice for the profile settings. */
export function LanguageSegmented() {
  const locale = useLocale() as Locale;
  const t = useTranslations('nav.language');
  const { change } = useChangeLocale();
  return (
    <Segmented<Locale>
      label={t('label')}
      value={locale}
      onChange={(l) => void change(l)}
      items={LOCALES.map((l) => ({ value: l, label: LOCALE_LABELS[l] }))}
    />
  );
}
