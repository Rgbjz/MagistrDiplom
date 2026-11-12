'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../../lib/api/client';
import { useApiErrorMessage, useFormat } from '../../../i18n/format';
import type { UserSession } from '../../../lib/types';
import {
  Button,
  Field,
  Input,
  Skeleton,
  useToast,
} from '../../../components/ui';
import { describeUserAgent } from './userAgent';
import styles from './profile.module.scss';

function makeSchema(t: (key: 'enterCurrent' | 'min6' | 'mismatch') => string) {
  return z
    .object({
      currentPassword: z.string().min(1, t('enterCurrent')),
      newPassword: z.string().min(6, t('min6')),
      repeat: z.string(),
    })
    .refine((v) => v.newPassword === v.repeat, {
      path: ['repeat'],
      message: t('mismatch'),
    });
}
type Values = z.infer<ReturnType<typeof makeSchema>>;

export function SecuritySection() {
  const t = useTranslations('profile.security');
  const errorText = useApiErrorMessage();
  const f = useFormat();
  const schema = useMemo(() => makeSchema(t), [t]);
  const deviceWords = useMemo(
    () => ({ unknownDevice: t('unknownDevice'), app: t('app'), browser: t('browser') }),
    [t],
  );
  const toast = useToast();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const change = useMutation({
    mutationFn: (v: Values) =>
      clientApi<void>('/users/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: v.currentPassword,
          newPassword: v.newPassword,
        }),
      }),
    onSuccess: () => {
      toast(t('passwordChanged'));
      reset({ currentPassword: '', newPassword: '', repeat: '' });
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => clientApi<UserSession[]>('/users/me/sessions'),
  });

  const revoke = useMutation({
    mutationFn: (id: number) =>
      clientApi<void>(`/users/me/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast(t('sessionEnded'));
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  const endOthers = useMutation({
    mutationFn: () => clientApi<void>('/users/me/sessions', { method: 'DELETE' }),
    onSuccess: () => {
      toast(t('othersEnded'));
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: () => toast(t('reloginForOthers'), 'error'),
  });

  // The server marks the session of this token; older tokens have no session
  // id, then the most recently refreshed session is the best guess.
  const currentId =
    sessions?.find((s) => s.current)?.id ??
    (sessions?.length
      ? [...sessions].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0].id
      : null);

  return (
    <section className={styles.card} aria-labelledby="security-title">
      <h2 id="security-title" className={styles.sectionTitle}>
        {t('title')}
      </h2>
      <form className={styles.form} onSubmit={handleSubmit((v) => change.mutate(v))}>
        <div className={styles.row3}>
          <Field label={t('currentPassword')} error={errors.currentPassword?.message}>
            <Input type="password" autoComplete="current-password" {...register('currentPassword')} />
          </Field>
          <Field label={t('newPassword')} error={errors.newPassword?.message}>
            <Input type="password" autoComplete="new-password" {...register('newPassword')} />
          </Field>
          <Field label={t('repeatPassword')} error={errors.repeat?.message}>
            <Input type="password" autoComplete="new-password" {...register('repeat')} />
          </Field>
        </div>
        <div>
          <Button type="submit" variant="outline" loading={change.isPending}>
            {t('changePassword')}
          </Button>
        </div>
      </form>

      <h3 className={styles.subTitle}>{t('sessionsTitle')}</h3>
      {isLoading ? (
        <Skeleton height={64} />
      ) : !sessions?.length ? (
        <p className={styles.muted}>{t('noSessions')}</p>
      ) : (
        <ul className={styles.sessions}>
          {sessions.map((s) => (
            <li key={s.id} className={styles.session}>
              <span className={styles.sessionIcon}>
                <Laptop size={18} aria-hidden="true" />
              </span>
              <span className={styles.sessionText}>
                <span className={styles.sessionName}>
                  {describeUserAgent(s.userAgent, deviceWords)}
                </span>
                <span className={styles.muted}>
                  {s.ip ? `${s.ip} · ` : ''}
                  {t('activity', { time: f.relative(s.updatedAt) })}
                </span>
              </span>
              {s.id === currentId ? (
                <span className={styles.current}>{t('thisDevice')}</span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  loading={revoke.isPending && revoke.variables === s.id}
                  onClick={() => revoke.mutate(s.id)}
                >
                  {t('end')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {sessions && sessions.length > 1 && (
        <div>
          <Button variant="outline" loading={endOthers.isPending} onClick={() => endOthers.mutate()}>
            {t('endOthers')}
          </Button>
        </div>
      )}
    </section>
  );
}
