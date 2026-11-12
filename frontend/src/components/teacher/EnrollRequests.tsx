'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { clientApi } from '../../lib/api/client';
import { useTranslations } from 'next-intl';
import { displayName, fileUrl } from '../../lib/format';
import { useApiErrorMessage } from '../../i18n/format';
import type { EnrollRequest } from '../../lib/types';
import { Avatar, Button, EmptyState, Skeleton, useToast } from '../ui';
import styles from './EnrollRequests.module.scss';

/** Pending enrollment requests of one course with approve / reject. */
export function EnrollRequests({
  courseId,
  variant = 'list',
}: {
  courseId: number;
  /** "strip" = compact highlighted block above the students table. */
  variant?: 'list' | 'strip';
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const t = useTranslations('manage.requests');
  const errorText = useApiErrorMessage();
  const { data: requests, isLoading } = useQuery<EnrollRequest[]>({
    queryKey: ['enrollRequests', courseId],
    queryFn: () =>
      clientApi<EnrollRequest[]>(`/courses/${courseId}/enrollments?status=PENDING`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['enrollRequests', courseId] });
    queryClient.invalidateQueries({ queryKey: ['studentsProgress', courseId] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const decide = useMutation({
    mutationFn: ({ userId, action }: { userId: number; action: 'approve' | 'reject'; name: string }) =>
      clientApi(`/courses/${courseId}/enroll/${userId}/${action}`, { method: 'POST' }),
    onSuccess: (_d, { action, name }) => {
      toast(action === 'approve' ? t('approved', { name }) : t('rejected', { name }));
      invalidate();
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  if (isLoading) return <Skeleton height={variant === 'strip' ? 72 : 160} radius="var(--radius-lg)" />;
  const list = requests ?? [];
  if (list.length === 0) {
    return variant === 'strip' ? null : (
      <EmptyState icon={<Inbox size={40} />} title={t('emptyTitle')}>
        <p className={styles.muted}>{t('emptyHint')}</p>
      </EmptyState>
    );
  }

  return (
    <section
      className={`${styles.wrap} ${variant === 'strip' ? styles.strip : ''}`}
      aria-label={t('ariaLabel')}
    >
      {variant === 'strip' && (
        <h2 className={styles.stripTitle}>{t('waiting', { count: list.length })}</h2>
      )}
      <ul className={styles.list}>
        {list.map((r) => {
          const name = displayName(r.student.profile, r.student.email);
          return (
            <li key={r.id} className={styles.item}>
              <div className={styles.person}>
                <Avatar src={fileUrl(r.student.profile?.avatarUrl)} name={name} size={40} />
                <div className={styles.text}>
                  <span className={styles.name}>{name}</span>
                  <span className={styles.email}>{r.student.email}</span>
                </div>
              </div>
              <div className={styles.actions}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={decide.isPending}
                  aria-label={t('rejectAria', { name })}
                  onClick={() => decide.mutate({ userId: r.userId, action: 'reject', name })}
                >
                  {t('reject')}
                </Button>
                <Button
                  size="sm"
                  disabled={decide.isPending}
                  aria-label={t('approveAria', { name })}
                  onClick={() => decide.mutate({ userId: r.userId, action: 'approve', name })}
                >
                  {t('approve')}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
