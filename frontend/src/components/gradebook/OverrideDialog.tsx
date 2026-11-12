'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../lib/api/client';
import { useApiErrorMessage, useFormat } from '../../i18n/format';
import type { OverrideHistoryEntry, OverrideMark } from '../../lib/types';
import { Button, Field, Input, Modal, Textarea, useToast } from '../ui';
import { fmt } from './grades';
import styles from './gradebook.module.scss';

export interface OverrideTarget {
  userId: number;
  name: string;
  /** 'test-<id>' | 'assignment-<id>' | 'final' */
  itemKey: string;
  itemTitle: string;
  /** Upper bound: 100 for tests and the final grade, maxScore for assignments. */
  max: number;
  unit: '%' | 'points';
  value: number | null;
  overridden?: OverrideMark;
  assignmentLink?: string;
}

/** Staff dialog: set or reset a manual grade, with the change history. */
export function OverrideDialog({
  courseId,
  target,
  onClose,
}: {
  courseId: number;
  target: OverrideTarget | null;
  onClose: () => void;
}) {
  const t = useTranslations('gradebook.override');
  const f = useFormat();
  const toast = useToast();
  const errorText = useApiErrorMessage();
  const queryClient = useQueryClient();
  const comma = useLocale() !== 'en';
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!target) return;
    setValue(target.value === null ? '' : String(target.value));
    setReason(target.overridden?.reason ?? '');
    setShowErrors(false);
  }, [target]);

  const history = useQuery({
    queryKey: ['gradebook-history', courseId, target?.userId],
    queryFn: () =>
      clientApi<OverrideHistoryEntry[]>(
        `/courses/${courseId}/gradebook/overrides/history?userId=${target!.userId}`,
      ),
    enabled: !!target,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['gradebook', courseId] });
    void queryClient.invalidateQueries({ queryKey: ['gradebook-history', courseId] });
  };

  const save = useMutation({
    mutationFn: () =>
      clientApi(`/courses/${courseId}/gradebook/overrides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: target!.userId,
          itemKey: target!.itemKey,
          value: Number(value.replace(',', '.')),
          reason: reason.trim(),
        }),
      }),
    onSuccess: () => {
      toast(t('saved'));
      refresh();
      onClose();
    },
    onError: (e) => toast(errorText(e, t('failed')), 'error'),
  });

  const reset = useMutation({
    mutationFn: () =>
      clientApi(
        `/courses/${courseId}/gradebook/overrides?userId=${target!.userId}&itemKey=${encodeURIComponent(target!.itemKey)}&reason=${encodeURIComponent(t('resetReason'))}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      toast(t('resetDone'));
      refresh();
      onClose();
    },
    onError: (e) => toast(errorText(e, t('failed')), 'error'),
  });

  if (!target) return null;

  const num = Number(value.replace(',', '.'));
  const valueError =
    value.trim() === '' || !Number.isFinite(num) || num < 0 || num > target.max
      ? t('valueRange', { max: target.max })
      : null;
  const reasonError = reason.trim().length < 5 ? t('reasonShort') : null;
  const show = (n: number | null) =>
    n === null ? '—' : target.unit === '%' ? `${fmt(n, comma)}%` : `${fmt(n, comma)}/${target.max}`;
  const entries = (history.data ?? []).filter((h) => h.itemKey === target.itemKey);

  return (
    <Modal
      open
      onClose={onClose}
      title={t('title')}
      footer={
        <>
          {target.overridden && (
            <Button variant="outline" loading={reset.isPending} onClick={() => reset.mutate()}>
              {t('reset')}
            </Button>
          )}
          <Button
            loading={save.isPending}
            onClick={() => {
              if (valueError || reasonError) {
                setShowErrors(true);
                return;
              }
              save.mutate();
            }}
          >
            {t('save')}
          </Button>
        </>
      }
    >
      <p className={styles.dialogLead}>
        <strong>{target.name}</strong> · {target.itemTitle}
      </p>
      <dl className={styles.dialogValues}>
        <div>
          <dt>{t('current')}</dt>
          <dd>{show(target.value)}</dd>
        </div>
        {target.overridden && (
          <div>
            <dt>{t('computed')}</dt>
            <dd>{show(target.overridden.original)}</dd>
          </div>
        )}
      </dl>
      <Field
        label={t('newValue')}
        hint={t('valueHint', { max: target.max })}
        error={showErrors ? (valueError ?? undefined) : undefined}
      >
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          max={target.max}
          step="0.1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={showErrors && !!valueError}
        />
      </Field>
      <Field
        label={t('reason')}
        hint={t('reasonHint')}
        error={showErrors ? (reasonError ?? undefined) : undefined}
      >
        <Textarea
          rows={3}
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={showErrors && !!reasonError}
        />
      </Field>
      {target.assignmentLink && (
        <Link href={target.assignmentLink} className={styles.link}>
          {t('openWork')}
        </Link>
      )}
      <section className={styles.history} aria-label={t('history')}>
        <h3 className={styles.historyTitle}>{t('history')}</h3>
        {entries.length === 0 ? (
          <p className={styles.muted}>{t('noHistory')}</p>
        ) : (
          <ol className={styles.historyList}>
            {entries.map((h) => (
              <li key={h.id}>
                <span className={styles.historyChange}>
                  {t('change', { old: show(h.oldValue), new: show(h.newValue) })}
                </span>
                <span className={styles.historyReason}>{h.reason}</span>
                <span className={styles.muted}>{t('meta', { by: h.by, at: f.dateTime(h.at) })}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </Modal>
  );
}
