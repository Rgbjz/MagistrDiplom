'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useLocale } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { clientApi } from '../lib/api/client';
import type { Me } from '../lib/types';
import { isLocale } from './config';
import { writeLocaleCookie } from './useChangeLocale';

/**
 * After sign-in on a new device the cookie may not match the language saved
 * in the profile — adopt the saved one (the profile wins).
 */
export function LocaleSync() {
  const { status } = useSession();
  const locale = useLocale();
  const router = useRouter();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => clientApi<Me>('/users/me'),
    enabled: status === 'authenticated',
  });
  const saved = me?.profile?.locale;

  useEffect(() => {
    if (isLocale(saved) && saved !== locale) {
      writeLocaleCookie(saved);
      router.refresh();
    }
  }, [saved, locale, router]);

  return null;
}
