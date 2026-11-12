'use client';

import { useCallback, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { CourseLevel, EnrollmentStatus, Role } from '../lib/types';
import {
  apiErrorKey,
  formatDate,
  formatDateTime,
  formatPrice,
  groupThousands,
} from '../lib/format';
import { INTL_LOCALE, type Locale } from './config';

/**
 * Locale-bound formatters. Safe in client components (and in server components
 * that are not async). Async server components: use getLocale() + lib/format.
 */
export function useFormat() {
  const locale = useLocale() as Locale;
  const t = useTranslations('common');
  return useMemo(
    () => ({
      locale,
      date: (value: string | Date) => formatDate(value, locale),
      dateTime: (value: string | Date) => formatDateTime(value, locale),
      price: (price: number) => (price <= 0 ? t('price.free') : formatPrice(price, locale)),
      number: (value: number) => groupThousands(value, locale),
      /** "5 хв тому" / "yesterday" / "12 березня". */
      relative: (value: string | Date) => {
        const date = new Date(value);
        const min = Math.round((Date.now() - date.getTime()) / 60000);
        if (min < 1) return t('time.justNow');
        if (min < 60) return t('time.minutesAgo', { count: min });
        const hours = Math.round(min / 60);
        if (hours < 24) return t('time.hoursAgo', { count: hours });
        const days = Math.round(hours / 24);
        if (days === 1) return t('time.yesterday');
        if (days < 7) return t('time.daysAgo', { count: days });
        return date.toLocaleDateString(INTL_LOCALE[locale], { day: 'numeric', month: 'long' });
      },
    }),
    [locale, t],
  );
}

/** Labels for enums that come from the API. */
export function useLabels() {
  const t = useTranslations('common');
  return useMemo(
    () => ({
      role: (role: Role) => t(`role.${role}`),
      level: (level: CourseLevel) => t(`level.${level}`),
      enrollment: (status: EnrollmentStatus) => t(`enrollment.${status}`),
    }),
    [t],
  );
}

/** (err) → translated message; unknown errors give `fallback` or errors.generic. */
export function useApiErrorMessage() {
  const t = useTranslations('errors');
  return useCallback(
    (err: unknown, fallback?: string) => {
      const key = apiErrorKey(err);
      return key ? t(key) : (fallback ?? t('generic'));
    },
    [t],
  );
}

/** «Тест «X»» / «Тест: X» unless the title already starts with the word «test». */
export function useTestLabels() {
  const t = useTranslations('common');
  return useMemo(() => {
    const startsWithTest = (title: string) => /^(тест|test)/i.test(title.trim());
    return {
      label: (title: string) => (startsWithTest(title) ? title : t('test.label', { title })),
      short: (title: string) => (startsWithTest(title) ? title : t('test.short', { title })),
    };
  }, [t]);
}

/** "Залишилось 3 дні" / "Термін минув" for an assignment deadline. */
export function useDeadline() {
  const t = useTranslations('common');
  return useCallback(
    (dueAt: string | null | undefined): { text: string; overdue: boolean } | null => {
      if (!dueAt) return null;
      const ms = new Date(dueAt).getTime() - Date.now();
      if (ms < 0) return { text: t('deadline.overdue'), overdue: true };
      const days = Math.floor(ms / 86_400_000);
      if (days === 0) {
        const hours = Math.max(1, Math.floor(ms / 3_600_000));
        return { text: t('deadline.hoursLeft', { count: hours }), overdue: false };
      }
      return { text: t('deadline.daysLeft', { count: days }), overdue: false };
    },
    [t],
  );
}
