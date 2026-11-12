'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../lib/api/client';
import styles from './Header.module.scss';

export function NotificationBell() {
  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => clientApi<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 30_000,
  });
  const count = data?.count ?? 0;
  const t = useTranslations('nav.notifications');

  return (
    <Link
      href="/notifications"
      className={styles.iconBtn}
      aria-label={count ? t('labelNew', { count }) : t('label')}
    >
      <Bell size={20} aria-hidden="true" />
      {count > 0 && <span className={styles.badge}>{count > 9 ? '9+' : count}</span>}
    </Link>
  );
}
