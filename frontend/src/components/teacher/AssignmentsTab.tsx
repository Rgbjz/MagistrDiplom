'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, FileUp } from 'lucide-react';
import { clientApi } from '../../lib/api/client';
import { useTranslations } from 'next-intl';
import { fileUrl } from '../../lib/format';
import { useApiErrorMessage, useDeadline, useFormat } from '../../i18n/format';
import type { AssignmentSummary, SubmissionWithStudent } from '../../lib/types';
import { Avatar, Badge, Button, EmptyState, Field, Input, Modal, Skeleton, Textarea, useToast, ScrollArea } from '../ui';
import { NetworkError } from '../states';
import { SubmissionStatusBadge } from '../course/AssignmentViewer';
import ui from './shared.module.scss';
import styles from './AssignmentsTab.module.scss';

/** Manage page tab: every assignment of the course with its submissions and grading. */
export function AssignmentsTab({ courseId }: { courseId: number }) {
  const t = useTranslations('manage.assignments');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['assignmentsSummary', courseId],
    queryFn: () => clientApi<AssignmentSummary[]>(`/courses/${courseId}/assignments-summary`),
  });

  if (isLoading) return <Skeleton height={240} radius="var(--radius-lg)" />;
  if (isError) return <NetworkError onRetry={() => refetch()} />;
  if (!data || data.length === 0) {
    return (
      <div className={`${ui.card} ${ui.cardPad}`}>
        <EmptyState icon={<FileUp size={40} />} title={t('emptyTitle')}>
          <p className={ui.muted}>{t('emptyHint')}</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      {data.map((a) => (
        <AssignmentBlock key={a.assignmentId} summary={a} courseId={courseId} />
      ))}
    </div>
  );
}

function AssignmentBlock({ summary, courseId }: { summary: AssignmentSummary; courseId: number }) {
  const t = useTranslations('manage.assignments');
  const fmt = useFormat();
  const deadlineOf = useDeadline();
  const [grading, setGrading] = useState<SubmissionWithStudent | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['assignment-submissions', summary.assignmentId],
    queryFn: () =>
      clientApi<SubmissionWithStudent[]>(`/assignments/${summary.assignmentId}/submissions`),
  });
  const deadline = deadlineOf(summary.dueAt);

  return (
    <section className={`${ui.card} ${ui.cardPad}`} aria-labelledby={`assignment-${summary.assignmentId}`}>
      <div className={styles.head}>
        <div className={ui.personText}>
          <h2 id={`assignment-${summary.assignmentId}`} className={styles.title}>
            {summary.title}
          </h2>
          <span className={ui.personSub}>
            {summary.lessonTitle}
            {summary.dueAt && (
              <>
                {' · '}
                <CalendarClock size={13} aria-hidden="true" className={styles.inlineIcon} />
                {t('due', { date: fmt.dateTime(summary.dueAt) })}
                {deadline?.overdue && t('overdue')}
              </>
            )}
          </span>
        </div>
        <div className={styles.counts}>
          <Badge tone="primary">{t('pending', { count: summary.pending })}</Badge>
          <Badge tone="success">{t('graded', { count: summary.graded })}</Badge>
          {summary.returned > 0 && <Badge tone="warning">{t('returned', { count: summary.returned })}</Badge>}
          {summary.late > 0 && <Badge tone="danger">{t('late', { count: summary.late })}</Badge>}
        </div>
      </div>

      {isLoading ? (
        <Skeleton height={100} />
      ) : !data || data.length === 0 ? (
        <p className={ui.muted}>{t('none')}</p>
      ) : (
        <ScrollArea className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">{t('table.student')}</th>
                <th scope="col">{t('table.submitted')}</th>
                <th scope="col">{t('table.files')}</th>
                <th scope="col">{t('table.status')}</th>
                <th scope="col">
                  <span className="sr-only">{t('table.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className={ui.person}>
                      <Avatar src={fileUrl(s.student.avatarUrl)} name={s.student.name} size={32} />
                      <div className={ui.personText}>
                        <span className={ui.personName}>{s.student.name}</span>
                        <span className={ui.personSub}>{s.student.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>{fmt.dateTime(s.submittedAt)}</td>
                  <td>
                    <ul className={styles.files}>
                      {s.files.map((f) => (
                        <li key={f.id}>
                          <a href={fileUrl(f.url) ?? f.url} target="_blank" rel="noopener noreferrer" download={f.name}>
                            {f.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <SubmissionStatusBadge submission={s} maxScore={summary.maxScore} />
                  </td>
                  <td>
                    <div className={ui.rowActions}>
                      <Button
                        size="sm"
                        variant={s.status === 'SUBMITTED' ? 'primary' : 'outline'}
                        onClick={() => setGrading(s)}
                      >
                        {s.status === 'SUBMITTED' ? t('check') : t('changeGrade')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      )}

      {grading && (
        <GradeDialog
          submission={grading}
          summary={summary}
          courseId={courseId}
          onClose={() => setGrading(null)}
        />
      )}
    </section>
  );
}

function GradeDialog({
  submission,
  summary,
  courseId,
  onClose,
}: {
  submission: SubmissionWithStudent;
  summary: AssignmentSummary;
  courseId: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const t = useTranslations('manage.grade');
  const errorText = useApiErrorMessage();
  const fmt = useFormat();
  const [score, setScore] = useState(submission.score === null ? '' : String(submission.score));
  const [feedback, setFeedback] = useState(submission.feedback ?? '');
  const value = Number(score);
  const scoreInvalid = score === '' || !Number.isInteger(value) || value < 0 || value > summary.maxScore;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['assignment-submissions', summary.assignmentId] }),
      queryClient.invalidateQueries({ queryKey: ['assignmentsSummary', courseId] }),
      queryClient.invalidateQueries({ queryKey: ['studentsProgress', courseId] }),
    ]);

  const json = (body: unknown) => ({
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const grade = useMutation({
    mutationFn: () =>
      clientApi(`/submissions/${submission.id}/grade`, json({ score: value, feedback: feedback.trim() || undefined })),
    onSuccess: async () => {
      toast(t('saved'));
      await refresh();
      onClose();
    },
    onError: (e) => toast(errorText(e, t('saveFailed')), 'error'),
  });
  const giveBack = useMutation({
    mutationFn: () => clientApi(`/submissions/${submission.id}/return`, json({ feedback: feedback.trim() })),
    onSuccess: async () => {
      toast(t('returned'));
      await refresh();
      onClose();
    },
    onError: (e) => toast(errorText(e, t('returnFailed')), 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={t('title', { name: submission.student.name })}
      footer={
        <>
          <Button
            variant="outline"
            disabled={!feedback.trim()}
            loading={giveBack.isPending}
            onClick={() => giveBack.mutate()}
          >
            {t('return')}
          </Button>
          <Button disabled={scoreInvalid} loading={grade.isPending} onClick={() => grade.mutate()}>
            {t('grade')}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <p className={ui.muted}>
          {t('submittedAt', { title: summary.title, date: fmt.dateTime(submission.submittedAt) })}
          {submission.late && t('late')}
        </p>
        {submission.comment && <p className={styles.comment}>«{submission.comment}»</p>}
        <ul className={styles.files}>
          {submission.files.map((f) => (
            <li key={f.id}>
              <a href={fileUrl(f.url) ?? f.url} target="_blank" rel="noopener noreferrer" download={f.name}>
                {f.name}
              </a>
            </li>
          ))}
        </ul>
        <Field
          label={t('score', { max: summary.maxScore })}
          error={score !== '' && scoreInvalid ? t('scoreRange', { max: summary.maxScore }) : undefined}
        >
          <Input
            type="number"
            min={0}
            max={summary.maxScore}
            inputMode="numeric"
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
        </Field>
        <Field label={t('feedback')} hint={t('feedbackHint')}>
          <Textarea rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={5000} />
        </Field>
      </div>
    </Modal>
  );
}
