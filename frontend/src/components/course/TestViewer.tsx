'use client';

import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ClipboardCheck, Clock, ListChecks, Target } from 'lucide-react';
import { clientApi } from '../../lib/api/client';
import { useTranslations } from 'next-intl';
import { useApiErrorMessage, useFormat } from '../../i18n/format';
import type {
  MyTestResult,
  SessionUser,
  TestFull,
  TestStartResponse,
} from '../../lib/types';
import { Badge, Button, Skeleton, useToast, ScrollArea } from '../ui';
import styles from './TestViewer.module.scss';

/** Test intro inside the course page: rules, last result, start button. */
export function TestViewer({
  testId,
  courseId,
  user,
  onStarted,
}: {
  testId: number;
  courseId: number;
  user: SessionUser;
  onStarted: (session: TestStartResponse, test: TestFull) => void;
}) {
  const toast = useToast();
  const t = useTranslations('test');
  const errorText = useApiErrorMessage();
  const f = useFormat();
  const isStudent = user.role === 'STUDENT';

  const { data: test, isLoading } = useQuery<TestFull>({
    queryKey: ['test', testId],
    queryFn: () => clientApi<TestFull>(`/tests/${testId}`),
  });

  const { data: myResult } = useQuery<MyTestResult | null>({
    queryKey: ['myTestResult', testId],
    queryFn: () => clientApi<MyTestResult | null>(`/tests/${testId}/my-result`),
    enabled: isStudent,
  });

  const startMutation = useMutation({
    mutationFn: () =>
      clientApi<TestStartResponse>(`/tests/${testId}/start`, { method: 'POST' }),
    onSuccess: (data) => test && onStarted(data, test),
    onError: (e) => toast(errorText(e, t('viewer.startError')), 'error'),
  });

  if (isLoading || !test) {
    return <Skeleton height={260} radius="var(--radius-lg)" />;
  }

  if (!isStudent) return <TeacherResults testId={testId} test={test} />;

  const count = test.questionCount;
  const noAttempts = test.attemptsLeft === 0;

  return (
    <section className={styles.intro} aria-labelledby="test-title">
      <span className={styles.introIcon}>
        <ClipboardCheck size={28} aria-hidden="true" />
      </span>
      <div className={styles.introText}>
        <span className={styles.eyebrow}>{t('viewer.eyebrow')}</span>
        <h1 id="test-title" className={styles.introTitle}>
          {test.title}
        </h1>
      </div>

      <dl className={styles.meta}>
        <div className={styles.metaBox}>
          <ListChecks size={18} aria-hidden="true" />
          <dt className="sr-only">{t('viewer.questionsTerm')}</dt>
          <dd>{t('viewer.questions', { count })}</dd>
        </div>
        <div className={styles.metaBox}>
          <Clock size={18} aria-hidden="true" />
          <dt className="sr-only">{t('viewer.timeLimitTerm')}</dt>
          <dd>{t('viewer.minutes', { count: test.timeLimit })}</dd>
        </div>
        <div className={styles.metaBox}>
          <Target size={18} aria-hidden="true" />
          <dt className="sr-only">{t('viewer.passingTerm')}</dt>
          <dd>{t('viewer.passing', { score: test.passingScore })}</dd>
        </div>
        {test.maxAttempts !== null && (
          <div className={styles.metaBox}>
            <ClipboardCheck size={18} aria-hidden="true" />
            <dt className="sr-only">{t('viewer.attemptsTerm')}</dt>
            <dd>{t('viewer.attemptsLeft', { left: test.attemptsLeft ?? 0, max: test.maxAttempts })}</dd>
          </div>
        )}
      </dl>

      {myResult && (
        <div className={styles.lastResult}>
          <div>
            <span className={styles.lastLabel}>{t('viewer.lastAttempt')}</span>
            <span className={styles.lastScore}>
              {myResult.score}%{' '}
              <StatusBadge passed={myResult.passed} pending={myResult.pendingReview} />
            </span>
            <span className={styles.lastDate}>{f.dateTime(myResult.finishedAt)}</span>
          </div>
          <Link href={`/courses/${courseId}/tests/${testId}/result`} className={styles.link}>
            {t('viewer.review')}
          </Link>
        </div>
      )}

      <p className={styles.rules}>
        {t('viewer.rules')}
      </p>

      <div>
        <Button
          size="lg"
          loading={startMutation.isPending}
          disabled={count === 0 || noAttempts}
          onClick={() => startMutation.mutate()}
        >
          {myResult ? t('viewer.retry') : t('viewer.start')}
        </Button>
        {count === 0 && <p className={styles.rules}>{t('viewer.noQuestions')}</p>}
        {noAttempts && <p className={styles.rules}>{t('viewer.noAttempts')}</p>}
      </div>
    </section>
  );
}

/** Passed / failed, or «На перевірці» while an essay waits for grading. */
export function StatusBadge({ passed, pending }: { passed: boolean | null; pending?: boolean }) {
  const t = useTranslations('test');
  if (pending) return <Badge tone="warning">{t('status.pending')}</Badge>;
  return (
    <Badge tone={passed ? 'success' : 'danger'}>
      {passed ? t('status.passed') : t('status.failed')}
    </Badge>
  );
}

interface TeacherResultRow {
  userId: number;
  userName: string;
  email: string;
  attempt: number;
  score: number | null;
  passed: boolean | null;
  pendingReview?: boolean;
  finishedAt: string | null;
}

function TeacherResults({ testId, test }: { testId: number; test: TestFull }) {
  const t = useTranslations('test');
  const { data: rows, isLoading } = useQuery<TeacherResultRow[]>({
    queryKey: ['testResults', testId],
    queryFn: () => clientApi<TeacherResultRow[]>(`/tests/${testId}/results`),
  });

  return (
    <section className={styles.intro} aria-labelledby="test-title">
      <div className={styles.introText}>
        <span className={styles.eyebrow}>
          {t('teacher.summary', {
            count: test.questionCount,
            minutes: test.timeLimit,
            score: test.passingScore,
          })}
        </span>
        <h1 id="test-title" className={styles.introTitle}>
          {test.title}
        </h1>
      </div>
      <h2 className={styles.subTitle}>{t('teacher.results')}</h2>
      {isLoading ? (
        <Skeleton height={120} />
      ) : !rows || rows.length === 0 ? (
        <p className={styles.rules}>{t('teacher.empty')}</p>
      ) : (
        <ScrollArea className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('teacher.student')}</th>
                <th scope="col">Email</th>
                <th scope="col">{t('teacher.attempt')}</th>
                <th scope="col">{t('teacher.score')}</th>
                <th scope="col">{t('teacher.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId}>
                  <td>{r.userName || r.email}</td>
                  <td>{r.email}</td>
                  <td>{r.attempt}</td>
                  <td>{r.score ?? '—'}%</td>
                  <td>
                    <StatusBadge passed={r.passed} pending={r.pendingReview} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </section>
  );
}
