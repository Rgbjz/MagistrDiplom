'use client';

import { useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../lib/api/client';
import { LOCALE_COOKIE, type Locale } from './config';

/** Writes the locale cookie the server reads (1 year, whole site). */
export function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Switches the interface language: cookie → server re-render. Signed-in users
 * also get it saved to their profile so emails and other devices follow.
 */
export function useChangeLocale() {
  const router = useRouter();
  const { status } = useSession();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();

  const change = useCallback(
    async (locale: Locale) => {
      writeLocaleCookie(locale);
      if (status === 'authenticated') {
        const form = new FormData();
        form.append('locale', locale);
        try {
          await clientApi('/users/me/profile', { method: 'PUT', body: form });
          await queryClient.invalidateQueries({ queryKey: ['me'] });
        } catch {
          // The cookie already switched the UI; the profile syncs next time.
        }
      }
      startTransition(() => router.refresh());
    },
    [queryClient, router, status],
  );

  return { change, pending };
}
