'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../lib/api/client';
import { useApiErrorMessage, useFormat } from '../../i18n/format';
import type { PendingReview } from '../../lib/types';
import { Badge, Button, Field, Input, Modal, Textarea, useToast, ScrollArea } from '../ui';
import ui from './shared.module.scss';
import styles from './TestEditor.module.scss';

/** «Потребує перевірки»: essay answers waiting for a grade on this course. */
export function EssayReviews({ courseId }: { courseId: number }) {
  const t = useTranslations('test.review');
  const f = useFormat();
  const [open, setOpen] = useState<PendingReview | null>(null);
  const { data } = useQuery<PendingReview[]>({
    queryKey: ['essayReviews', courseId],
    queryFn: () => clientApi<PendingReview[]>(`/tests/reviews/course/${courseId}`),
    retry: false,
  });

  if (!data || data.length === 0) return null;

  return (
    <section className={ui.card} aria-labelledby="essay-reviews-title">
      <div className={ui.cardPad}>
        <h2 id="essay-reviews-title" className={styles.reviewTitle}>
          {t('title')} <Badge tone="warning">{data.length}</Badge>
        </h2>
        <p className={ui.muted}>{t('hint')}</p>
      </div>
      <ScrollArea className={ui.tableWrap}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th scope="col">{t('student')}</th>
              <th scope="col">{t('test')}</th>
              <th scope="col">{t('question')}</th>
              <th scope="col">{t('submitted')}</th>
              <th scope="col">
                <span className="sr-only">{t('actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className={ui.personText}>
                    <span className={ui.personName}>{r.student.name || r.student.email}</span>
                    <span className={ui.personSub}>{r.student.email}</span>
                  </div>
                </td>
                <td>
                  {r.testTitle}
                  <span className={ui.personSub}> · {t('attempt', { number: r.attempt })}</span>
                </td>
                <td className={styles.clamp}>{r.question}</td>
                <td>{f.dateTime(r.submittedAt)}</td>
                <td>
                  <div className={ui.rowActions}>
                    <Button
                      size="sm"
                      aria-label={t('gradeAria', { student: r.student.name || r.student.email })}
                      onClick={() => setOpen(r)}
                    >
                      {t('grade')}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
      {open && <GradeDialog key={open.id} courseId={courseId} review={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function GradeDialog({
  courseId,
  review,
  onClose,
}: {
  courseId: number;
  review: PendingReview;
  onClose: () => void;
}) {
  const t = useTranslations('test.review');
  const toast = useToast();
  const errorText = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [points, setPoints] = useState('');
  const [feedback, setFeedback] = useState('');
  const n = Number(points.replace(',', '.'));
  const valid = points.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= review.maxPoints;

  const grade = useMutation({
    mutationFn: () =>
      clientApi(`/tests/attempt-questions/${review.id}/grade`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: n, ...(feedback.trim() ? { feedback: feedback.trim() } : {}) }),
      }),
    onSuccess: () => {
      toast(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['essayReviews', courseId] });
      queryClient.invalidateQueries({ queryKey: ['testsSummary', courseId] });
      queryClient.invalidateQueries({ queryKey: ['testResults', review.testId] });
      queryClient.invalidateQueries({ queryKey: ['gradebook', courseId] });
      onClose();
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={t('dialogTitle', { student: review.student.name || review.student.email })}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button disabled={!valid} loading={grade.isPending} onClick={() => grade.mutate()}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className={styles.reviewBody}>
        <p className={styles.subLabel}>{review.question}</p>
        {review.rubric && (
          <p className={styles.hint}>
            <b>{t('rubric')}</b> {review.rubric}
          </p>
        )}
        <span className={styles.subLabel}>{t('answer')}</span>
        <blockquote className={styles.essayAnswer}>{review.answer || '—'}</blockquote>
        <Field label={t('points', { max: review.maxPoints })}>
          <Input
            inputMode="decimal"
            className={styles.narrow}
            value={points}
            aria-invalid={points !== '' && !valid}
            onChange={(e) => setPoints(e.target.value)}
          />
        </Field>
        <Field label={t('feedback')}>
          <Textarea rows={4} maxLength={2000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
