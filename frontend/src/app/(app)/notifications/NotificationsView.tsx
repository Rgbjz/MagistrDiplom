'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import {
  Award,
  Bell,
  BookOpen,
  CheckCheck,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  CreditCard,
  FileCheck,
  FileUp,
  MessageCircle,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { clientApi } from '../../../lib/api/client';
import { useApiErrorMessage } from '../../../i18n/format';
import { INTL_LOCALE, type Locale } from '../../../i18n/config';
import type {
  AppNotification,
  Me,
  NotificationFilter,
  NotificationType,
  UserProfile,
} from '../../../lib/types';
import {
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
  Tabs,
  useToast,
} from '../../../components/ui';
import styles from './notifications.module.scss';

const ICON: Record<NotificationType, { icon: LucideIcon; tone: string }> = {
  ENROLLMENT_REQUEST: { icon: UserPlus, tone: 'primary' },
  ENROLLMENT_APPROVED: { icon: CircleCheck, tone: 'success' },
  ENROLLMENT_REJECTED: { icon: CircleX, tone: 'danger' },
  NEW_LESSON: { icon: BookOpen, tone: 'primary' },
  TEST_RESULT: { icon: ClipboardCheck, tone: 'warning' },
  NEW_MESSAGE: { icon: MessageCircle, tone: 'violet' },
  PAYMENT: { icon: CreditCard, tone: 'success' },
  CERTIFICATE: { icon: Award, tone: 'warning' },
  ASSIGNMENT_SUBMITTED: { icon: FileUp, tone: 'primary' },
  ASSIGNMENT_GRADED: { icon: FileCheck, tone: 'success' },
  COURSE_STAFF_ADDED: { icon: Users, tone: 'violet' },
};

type Group = 'today' | 'yesterday' | 'earlier';

function groupOf(date: Date): Group {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : 'earlier';
}

function timeOf(value: string, locale: Locale): string {
  const d = new Date(value);
  return groupOf(d) === 'earlier'
    ? d.toLocaleDateString(INTL_LOCALE[locale], { day: 'numeric', month: 'long' })
    : d.toLocaleTimeString(INTL_LOCALE[locale], { hour: '2-digit', minute: '2-digit' });
}

export function NotificationsView() {
  const t = useTranslations('notifications');
  const locale = useLocale() as Locale;
  const errorText = useApiErrorMessage();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: ['notifications', 'list', filter],
    queryFn: () => clientApi<AppNotification[]>(`/notifications?filter=${filter}`),
  });
  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => clientApi<{ count: number }>('/notifications/unread-count'),
  });
  const unreadCount = unread?.count ?? 0;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const markRead = useMutation({
    mutationFn: (id: number) =>
      clientApi<void>(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: refresh,
  });
  const markAll = useMutation({
    mutationFn: () => clientApi<void>('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      toast(t('allMarked'));
      refresh();
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  function open(n: AppNotification) {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.link) router.push(n.link);
  }

  const groups = (['today', 'yesterday', 'earlier'] as const)
    .map((key) => ({
      key,
      label: t(`group.${key}`),
      items: (items ?? []).filter((n) => groupOf(new Date(n.createdAt)) === key),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="container">
      <PageHeader
        title={t('title')}
        subtitle={unreadCount ? t('unread', { count: unreadCount }) : t('allRead')}
        actions={
          <Button
            variant="outline"
            onClick={() => markAll.mutate()}
            loading={markAll.isPending}
            disabled={!unreadCount}
          >
            <CheckCheck size={18} aria-hidden="true" /> {t('markAll')}
          </Button>
        }
      />

      <Tabs<NotificationFilter>
        label={t('filterLabel')}
        value={filter}
        onChange={setFilter}
        items={[
          { value: 'all', label: t('filter.all') },
          { value: 'unread', label: t('filter.unread'), count: unreadCount || undefined },
          { value: 'courses', label: t('filter.courses') },
          { value: 'tests', label: t('filter.tests') },
          { value: 'messages', label: t('filter.messages') },
        ]}
      />

      <div className={styles.layout}>
        <section aria-label={t('listLabel')} className={styles.list}>
          {isLoading ? (
            <Skeleton height={280} radius="var(--radius-lg)" />
          ) : groups.length === 0 ? (
            <EmptyState icon={<Bell size={28} />} title={t('empty')}>
              <p>{t('emptyText')}</p>
            </EmptyState>
          ) : (
            groups.map((g) => (
              <div key={g.key} className={styles.group}>
                <h2 className={styles.groupTitle}>{g.label}</h2>
                <ul className={styles.items}>
                  {g.items.map((n) => {
                    const { icon: Icon, tone } = ICON[n.type] ?? { icon: Bell, tone: 'primary' };
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          className={`${styles.item} ${n.readAt ? '' : styles.unread}`}
                          onClick={() => open(n)}
                        >
                          <span className={`${styles.icon} ${styles[tone]}`}>
                            <Icon size={20} aria-hidden="true" />
                          </span>
                          <span className={styles.text}>
                            <span className={styles.title}>{n.title}</span>
                            {n.body && <span className={styles.body}>{n.body}</span>}
                            <span className={styles.time}>{timeOf(n.createdAt, locale)}</span>
                          </span>
                          {!n.readAt && (
                            <span className={styles.dot} role="img" aria-label={t('unreadDot')} />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </section>

        <SettingsAside />
      </div>
    </div>
  );
}

function SettingsAside() {
  const t = useTranslations('notifications.aside');
  const errorText = useApiErrorMessage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => clientApi<Me>('/users/me'),
  });
  const save = useMutation({
    mutationFn: (on: boolean) => {
      const fd = new FormData();
      fd.append('emailNotifications', String(on));
      return clientApi<UserProfile>('/users/me/profile', { method: 'PUT', body: fd });
    },
    onSuccess: () => {
      toast(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  return (
    <aside className={styles.aside} aria-labelledby="notif-settings">
      <h2 id="notif-settings" className={styles.asideTitle}>
        {t('title')}
      </h2>
      <p className={styles.body}>
        {t('text')}
      </p>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={me?.profile?.emailNotifications ?? true}
          disabled={!me || save.isPending}
          onChange={(e) => save.mutate(e.currentTarget.checked)}
        />
        {t('email')}
      </label>
      <Link href="/profile#settings" className={styles.asideLink}>
        {t('allSettings')}
      </Link>
    </aside>
  );
}
