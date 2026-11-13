'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { LOCALES, LOCALE_LABELS, type Locale } from '../../i18n/config';
import { useChangeLocale } from '../../i18n/useChangeLocale';
import { Segmented } from '../ui';
import styles from './Header.module.scss';

/**
 * Language picker for the dark header: a button with the current language
 * code that opens a small menu (radio items, full keyboard support).
 */
export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const t = useTranslations('nav.language');
  const { change, pending } = useChangeLocale();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  // Close on outside click; focus the current language when the menu opens.
  useEffect(() => {
    if (!open) return;
    items.current[LOCALES.indexOf(locale)]?.focus();
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, locale]);

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }

  function pick(l: Locale) {
    close();
    if (l !== locale) void change(l);
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const current = items.current.findIndex((el) => el === document.activeElement);
    const focus = (i: number) => items.current[(i + LOCALES.length) % LOCALES.length]?.focus();
    if (e.key === 'ArrowDown') focus(current + 1);
    else if (e.key === 'ArrowUp') focus(current - 1);
    else if (e.key === 'Home') focus(0);
    else if (e.key === 'End') focus(LOCALES.length - 1);
    else if (e.key === 'Escape') close();
    else if (e.key === 'Tab') return close(false);
    else return;
    e.preventDefault();
  }

  return (
    <div className={styles.menuWrap} ref={wrap}>
      <button
        ref={button}
        type="button"
        className={styles.language}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('label')}: ${LOCALE_LABELS[locale]}`}
        title={t('label')}
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Globe size={18} aria-hidden="true" />
        <span className={styles.languageCode}>{locale.toUpperCase()}</span>
        <ChevronDown size={14} aria-hidden="true" className={styles.languageChevron} data-open={open} />
      </button>
      {open && (
        <div className={`${styles.menu} ${styles.languageMenu}`} role="menu" aria-label={t('label')} onKeyDown={onMenuKey}>
          <div className={styles.languageMenuTitle} aria-hidden="true">
            {t('label')}
          </div>
          {LOCALES.map((l, i) => (
            <button
              key={l}
              ref={(el) => {
                items.current[i] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={l === locale}
              lang={l}
              tabIndex={-1}
              className={styles.languageItem}
              data-active={l === locale}
              onClick={() => pick(l)}
            >
              <span className={styles.languageBadge} aria-hidden="true">
                {l.toUpperCase()}
              </span>
              <span className={styles.languageName}>{LOCALE_LABELS[l]}</span>
              {l === locale && <Check size={16} aria-hidden="true" className={styles.languageCheck} />}
            </button>
          ))}
        </div>
      )}
    </div>
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
