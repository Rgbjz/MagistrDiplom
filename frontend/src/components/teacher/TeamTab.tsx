'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { UserPlus, Users } from 'lucide-react';
import { clientApi } from '../../lib/api/client';
import { fileUrl } from '../../lib/format';
import { canCourse } from '../../lib/courseRole';
import { useApiErrorMessage, useFormat } from '../../i18n/format';
import type { CourseStaffList, CourseStaffMember, CourseStaffRole } from '../../lib/types';
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Input,
  Select,
  Skeleton,
  useToast,
  ScrollArea,
} from '../ui';
import { QueryError } from '../states';
import ui from './shared.module.scss';
import styles from './TeamTab.module.scss';

type Assignable = Exclude<CourseStaffRole, 'OWNER'>;

const ROLE_TONE: Record<CourseStaffRole, 'primary' | 'success' | 'neutral'> = {
  OWNER: 'primary',
  TEACHER: 'success',
  ASSISTANT: 'neutral',
};

/** Manage page tab: the course team. Only the owner (or an admin) can change it. */
export function TeamTab({ courseId }: { courseId: number }) {
  const t = useTranslations('manage.team');
  const toast = useToast();
  const errorText = useApiErrorMessage();
  const f = useFormat();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Assignable>('ASSISTANT');
  const [removing, setRemoving] = useState<CourseStaffMember | null>(null);

  const key = ['courseStaff', courseId];
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: key,
    queryFn: () => clientApi<CourseStaffList>(`/courses/${courseId}/staff`),
  });
  const canManage = canCourse(data?.myRole, 'owner');

  const onSaved = (next?: CourseStaffList) => {
    if (next) queryClient.setQueryData(key, next);
    else void queryClient.invalidateQueries({ queryKey: key });
  };

  const add = useMutation({
    mutationFn: () =>
      clientApi<CourseStaffList>(`/courses/${courseId}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      }),
    onSuccess: (next) => {
      onSaved(next);
      setEmail('');
      toast(t('added'));
    },
    onError: (e) => toast(addError(e), 'error'),
  });

  const update = useMutation({
    mutationFn: ({ userId, next }: { userId: number; next: Assignable }) =>
      clientApi<CourseStaffList>(`/courses/${courseId}/staff/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: next }),
      }),
    onSuccess: (next) => {
      onSaved(next);
      toast(t('roleChanged'));
    },
    onError: (e) => toast(addError(e), 'error'),
  });

  const remove = useMutation({
    mutationFn: (userId: number) =>
      clientApi(`/courses/${courseId}/staff/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      onSaved();
      setRemoving(null);
      toast(t('removed'));
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  function addError(e: unknown): string {
    const message = e instanceof Error ? e.message : '';
    if (/API 404/.test(message)) return t('errors.notFound');
    if (/already on the course team|already the course owner/i.test(message)) {
      return t('errors.alreadyMember');
    }
    if (/Only a teacher account/i.test(message)) return t('errors.teacherOnly');
    if (/Administrators/i.test(message)) return t('errors.admin');
    return errorText(e);
  }

  if (isLoading) return <Skeleton height={240} radius="var(--radius-lg)" />;
  if (isError || !data) return <QueryError error={error} onRetry={() => void refetch()} />;

  return (
    <div className={styles.stack}>
      {canManage && (
        <form
          className={`${ui.card} ${ui.cardPad} ${styles.invite}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) add.mutate();
          }}
        >
          <div className={styles.inviteText}>
            <h3 className={ui.h3}>{t('inviteTitle')}</h3>
            <p className={ui.muted}>{t('inviteHint')}</p>
          </div>
          <div className={styles.inviteRow}>
            <Field label={t('email')}>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@example.com"
              />
            </Field>
            <Field label={t('role')}>
              <Select value={role} onChange={(e) => setRole(e.target.value as Assignable)}>
                <option value="TEACHER">{t('roles.TEACHER')}</option>
                <option value="ASSISTANT">{t('roles.ASSISTANT')}</option>
              </Select>
            </Field>
            <Button type="submit" loading={add.isPending} className={styles.inviteBtn}>
              <UserPlus size={16} aria-hidden="true" /> {t('add')}
            </Button>
          </div>
        </form>
      )}

      <section className={`${ui.card} ${ui.cardPad}`} aria-labelledby="team-title">
        <div className={ui.sectionHead}>
          <h3 id="team-title" className={ui.h3}>
            <Users size={18} aria-hidden="true" /> {t('title', { count: data.staff.length })}
          </h3>
        </div>
        {!canManage && <p className={ui.muted}>{t('readOnly')}</p>}
        <ScrollArea className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">{t('columns.person')}</th>
                <th scope="col">{t('columns.role')}</th>
                <th scope="col">{t('columns.added')}</th>
                {canManage && <th scope="col">{t('columns.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {data.staff.map((m) => (
                <tr key={m.userId}>
                  <td>
                    <span className={ui.person}>
                      <Avatar src={fileUrl(m.avatarUrl)} name={m.name} size={32} />
                      <span className={ui.personText}>
                        <span className={ui.personName}>{m.name}</span>
                        <span className={ui.personSub}>{m.email}</span>
                      </span>
                    </span>
                  </td>
                  <td>
                    {canManage && m.role !== 'OWNER' ? (
                      <Select
                        aria-label={t('roleFor', { name: m.name })}
                        value={m.role}
                        disabled={update.isPending}
                        onChange={(e) =>
                          update.mutate({ userId: m.userId, next: e.target.value as Assignable })
                        }
                      >
                        {m.accountRole === 'TEACHER' && (
                          <option value="TEACHER">{t('roles.TEACHER')}</option>
                        )}
                        <option value="ASSISTANT">{t('roles.ASSISTANT')}</option>
                      </Select>
                    ) : (
                      <Badge tone={ROLE_TONE[m.role]}>{t(`roles.${m.role}`)}</Badge>
                    )}
                  </td>
                  <td>{f.date(m.addedAt)}</td>
                  {canManage && (
                    <td>
                      {m.role !== 'OWNER' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRemoving(m)}
                          aria-label={t('removeFor', { name: m.name })}
                        >
                          {t('remove')}
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </section>

      <section className={`${ui.card} ${ui.cardPad}`}>
        <h3 className={ui.h3}>{t('rolesTitle')}</h3>
        <ul className={styles.roleList}>
          {(['OWNER', 'TEACHER', 'ASSISTANT'] as const).map((r) => (
            <li key={r}>
              <Badge tone={ROLE_TONE[r]}>{t(`roles.${r}`)}</Badge>{' '}
              <span className={ui.muted}>{t(`roleHints.${r}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <ConfirmDialog
        open={!!removing}
        danger
        title={t('removeTitle')}
        description={removing ? t('removeText', { name: removing.name }) : undefined}
        confirmLabel={t('remove')}
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.userId)}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
