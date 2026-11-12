'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { clientApi } from '../../lib/api/client';
import { useTranslations } from 'next-intl';
import { useApiErrorMessage } from '../../i18n/format';
import type { AssignmentDetail } from '../../lib/types';
import { Button, ConfirmDialog, Field, Input, Skeleton, Textarea, useToast } from '../ui';
import styles from './LessonEditor.module.scss';

/** ISO → value for <input type="datetime-local"> in local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AssignmentEditor({
  assignmentId,
  courseId,
  onDeleted,
}: {
  assignmentId: number;
  courseId: number;
  onDeleted: () => void;
}) {
  const t = useTranslations('builder.assignment');
  const errorText = useApiErrorMessage();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: assignment, isLoading } = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: () => clientApi<AssignmentDetail>(`/assignments/${assignmentId}`),
  });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [maxScore, setMaxScore] = useState('100');
  const [maxFiles, setMaxFiles] = useState('5');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!assignment) return;
    setTitle(assignment.title);
    setDescription(assignment.description ?? '');
    setDueAt(toLocalInput(assignment.dueAt));
    setMaxScore(String(assignment.maxScore));
    setMaxFiles(String(assignment.maxFiles));
  }, [assignment]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['assignment', assignmentId] }),
      queryClient.invalidateQueries({ queryKey: ['course', courseId] }),
    ]);

  const score = Number(maxScore);
  const files = Number(maxFiles);
  const invalid =
    !title.trim() ||
    !Number.isInteger(score) || score < 1 || score > 1000 ||
    !Number.isInteger(files) || files < 1 || files > 10;

  const save = useMutation({
    mutationFn: () =>
      clientApi(`/assignments/${assignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          maxScore: score,
          maxFiles: files,
        }),
      }),
    onSuccess: async () => {
      toast(t('saved'));
      await refresh();
    },
    onError: (e) => toast(errorText(e, t('saveFailed')), 'error'),
  });

  const remove = useMutation({
    mutationFn: () => clientApi(`/assignments/${assignmentId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setConfirmDelete(false);
      toast(t('deleted'));
      await queryClient.invalidateQueries({ queryKey: ['course', courseId] });
      onDeleted();
    },
    onError: (e) => toast(errorText(e, t('deleteFailed')), 'error'),
  });

  if (isLoading || !assignment) {
    return <Skeleton height={420} radius="var(--radius-lg)" />;
  }

  return (
    <>
    <form
      className={`${styles.card} ${styles.editor}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) save.mutate();
      }}
    >
      <div className={styles.header}>
        <span className={styles.kicker}>{t('kicker')}</span>
        <Link href={`/courses/${courseId}/manage?tab=assignments`} className={styles.status}>
          {t('submissions')}
        </Link>
      </div>

      <Field label={t('title')}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
      </Field>

      <Field label={t('description')} hint={t('descriptionHint')}>
        <Textarea rows={8} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <div className={styles.row}>
        <Field label={t('dueAt')} hint={t('dueAtHint')}>
          <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </Field>
        <Field label={t('maxScore')} error={score < 1 || score > 1000 ? t('scoreRange') : undefined}>
          <Input
            type="number"
            min={1}
            max={1000}
            inputMode="numeric"
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
          />
        </Field>
        <Field label={t('maxFiles')} error={files < 1 || files > 10 ? t('filesRange') : undefined}>
          <Input
            type="number"
            min={1}
            max={10}
            inputMode="numeric"
            value={maxFiles}
            onChange={(e) => setMaxFiles(e.target.value)}
          />
        </Field>
      </div>

      <div className={`${styles.footer} ${styles.footerSplit}`}>
        <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={16} aria-hidden="true" /> {t('delete')}
        </Button>
        <Button type="submit" loading={save.isPending} disabled={invalid}>
          {t('save')}
        </Button>
      </div>
    </form>

      <ConfirmDialog
        open={confirmDelete}
        title={t('confirmTitle')}
        description={t('confirmText', { title: assignment.title })}
        confirmLabel={t('confirmDelete')}
        danger
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
