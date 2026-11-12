'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Check, ClipboardX, Hourglass, Minus, X } from 'lucide-react';
import { clientApi } from '../../../../../../../lib/api/client';
import { useTranslations } from 'next-intl';
import { useFormat, useTestLabels } from '../../../../../../../i18n/format';
import type { MyTestResult, MyTestResultDetail, TestAttempt } from '../../../../../../../lib/types';
import { Badge, EmptyState, Skeleton, ScrollArea } from '../../../../../../../components/ui';
import { StatusBadge } from '../../../../../../../components/course/TestViewer';
import styles from './result.module.scss';

const PREVIEW_COUNT = 5;

/** Points with up to two decimals (partial credit), e.g. 1.5. */
const pts = (n: number) => String(Math.round(n * 100) / 100);

function duration(start: string, end: string | null): string {
  if (!end) return '—';
  const s = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function TestResultPage() {
  const params = useParams<{ id: string; testId: string }>();
  const courseId = Number(params.id);
  const testId = Number(params.testId);
  const [showAll, setShowAll] = useState(false);
  const t = useTranslations('test');
  const f = useFormat();
  const tests = useTestLabels();

  const { data: result, isLoading } = useQuery<MyTestResult | null>({
    queryKey: ['myTestResult', testId],
    queryFn: () => clientApi<MyTestResult | null>(`/tests/${testId}/my-result`),
  });
  const { data: attempts } = useQuery<TestAttempt[]>({
    queryKey: ['myAttempts', testId],
    queryFn: () => clientApi<TestAttempt[]>(`/tests/${testId}/my-attempts`),
  });

  if (isLoading) {
    return (
      <div className="container">
        <Skeleton height={220} radius="var(--radius-lg)" />
        <Skeleton height={320} radius="var(--radius-lg)" />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="container">
        <EmptyState icon={<ClipboardX size={28} aria-hidden="true" />} title={t('result.notTaken')}>
          <Link href={`/courses/${courseId}?test=${testId}`} className={styles.primaryBtn}>
            {t('result.toTest')}
          </Link>
        </EmptyState>
      </div>
    );
  }

  // Wrong answers first so the review starts with what needs attention.
  const ordered = result.details
    .map((d, i) => ({ d, n: i + 1 }))
    .sort((a, b) => Number(a.d.isCorrect) - Number(b.d.isCorrect));
  const pending = result.pendingReview;
  const attemptsLeft =
    result.maxAttempts === null ? null : result.maxAttempts - (attempts ?? []).length;
  const visible = showAll ? ordered : ordered.slice(0, PREVIEW_COUNT);
  const finishedAttempts = (attempts ?? []).filter((a) => a.finishedAt);

  return (
    <div className="container">
      <nav aria-label={t('result.breadcrumbs')} className={styles.crumbs}>
        <Link href={`/courses/${courseId}`}>{result.courseTitle}</Link>
        <span aria-hidden="true">/</span>
        <span>{tests.label(result.testTitle)}</span>
      </nav>

      <section className={styles.hero} aria-labelledby="result-title">
        <div
          className={`${styles.ring} ${pending ? styles.ringPending : result.passed ? styles.ringPass : styles.ringFail}`}
          style={{ ['--score' as string]: `${result.score}%` }}
          role="img"
          aria-label={t('result.scoreLabel', { score: result.score })}
        >
          <span className={styles.ringValue}>{result.score}%</span>
        </div>
        <div className={styles.heroText}>
          {pending ? (
            <Badge tone="warning">{t('status.pending')}</Badge>
          ) : (
            <Badge tone={result.passed ? 'success' : 'danger'}>
              {result.passed ? t('result.passed') : t('result.failed')}
            </Badge>
          )}
          <h1 id="result-title" className={styles.title}>
            {tests.label(result.testTitle)}
          </h1>
          <p className={styles.muted}>
            {t('result.passing', { score: result.passingScore })}{' '}
            {pending
              ? t('result.pendingHint')
              : result.passed
                ? t('result.passedHint')
                : t('result.failedHint')}
          </p>
        </div>
        <dl className={styles.stats}>
          <div>
            <dt>{t('result.correct')}</dt>
            <dd>{t('result.correctValue', { correct: result.correct, total: result.total })}</dd>
          </div>
          <div>
            <dt>{t('result.points')}</dt>
            <dd>{t('result.pointsValue', { earned: pts(result.earnedPoints), total: result.totalPoints })}</dd>
          </div>
          <div>
            <dt>{t('result.time')}</dt>
            <dd>{duration(result.startedAt, result.finishedAt)}</dd>
          </div>
          <div>
            <dt>{t('result.attempt')}</dt>
            <dd>{result.attempt}</dd>
          </div>
        </dl>
        <div className={styles.actions}>
          <Link href={`/courses/${courseId}?lesson=${result.lessonId}`} className={styles.outlineBtn}>
            {t('result.backToCourse')}
          </Link>
          {attemptsLeft !== 0 && (
            <Link href={`/courses/${courseId}?test=${testId}`} className={styles.primaryBtn}>
              {t('result.retry')}
            </Link>
          )}
        </div>
      </section>

      {finishedAttempts.length > 0 && (
        <section className={styles.card} aria-labelledby="attempts-title">
          <h2 id="attempts-title" className={styles.cardTitle}>
            {t('result.history')}
          </h2>
          <ScrollArea className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('result.attempt')}</th>
                  <th scope="col">{t('result.date')}</th>
                  <th scope="col">{t('result.time')}</th>
                  <th scope="col">{t('result.score')}</th>
                  <th scope="col">{t('result.status')}</th>
                </tr>
              </thead>
              <tbody>
                {finishedAttempts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.attempt}</td>
                    <td>{f.dateTime(a.finishedAt!)}</td>
                    <td>{duration(a.startedAt, a.finishedAt)}</td>
                    <td>{a.score ?? 0}%</td>
                    <td>
                      <StatusBadge passed={a.passed} pending={a.pendingReview} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </section>
      )}

      <section className={styles.card} aria-labelledby="review-title">
        <h2 id="review-title" className={styles.cardTitle}>
          {t('result.review')}
        </h2>
        {!result.showCorrectAnswers && <p className={styles.muted}>{t('result.keyHidden')}</p>}
        {visible.map(({ d, n }) => (
          <ReviewItem key={d.questionId} detail={d} n={n} />
        ))}
        {ordered.length > PREVIEW_COUNT && (
          <button type="button" className={styles.more} onClick={() => setShowAll((v) => !v)}>
            {showAll ? t('result.collapse') : t('result.showAll', { count: ordered.length })}
          </button>
        )}
      </section>
    </div>
  );
}

function ReviewItem({ detail, n }: { detail: MyTestResultDetail; n: number }) {
  const t = useTranslations('test.result');
  const pending = detail.status === 'PENDING';
  const partial = !pending && !detail.isCorrect && detail.earned > 0;
  const state = pending ? 'pending' : detail.isCorrect ? 'right' : partial ? 'partial' : 'wrong';
  const Icon = pending ? Hourglass : detail.isCorrect ? Check : partial ? Minus : X;
  const showKey = !!detail.correct && !detail.isCorrect && !pending;

  return (
    <article className={styles.review}>
      <span
        className={`${styles.mark} ${detail.isCorrect ? styles.markOk : pending || partial ? styles.markWarn : styles.markBad}`}
        role="img"
        aria-label={t(state)}
      >
        <Icon size={16} strokeWidth={3} />
      </span>
      <div className={styles.reviewBody}>
        <h3 className={styles.reviewQ}>
          {n}. {detail.text}{' '}
          {detail.type === 'MULTIPLE' && <span className={styles.muted}>{t('multiple')}</span>}
        </h3>
        <span className={styles.line}>
          {pending
            ? t('pendingPoints', { points: detail.points })
            : t('earned', { earned: pts(detail.earned), points: detail.points })}
        </span>
        <YourAnswer detail={detail} />
        {showKey && <RightAnswer detail={detail} />}
        {detail.feedback && (
          <p className={styles.feedback}>
            <b>{t('feedback')}</b> {detail.feedback}
          </p>
        )}
      </div>
    </article>
  );
}

function Chips({ items, ok }: { items: string[]; ok?: boolean }) {
  return (
    <>
      {items.map((x, i) => (
        <code key={`${i}-${x}`} className={ok ? styles.codeOk : undefined}>
          {x}
        </code>
      ))}
    </>
  );
}

function YourAnswer({ detail }: { detail: MyTestResultDetail }) {
  const t = useTranslations('test.result');
  const tr = useTranslations('test.runner');
  const r = detail.response;
  const none = <em>{t('noAnswer')}</em>;
  let body: ReactNode = none;
  switch (detail.type) {
    case 'SINGLE':
    case 'MULTIPLE': {
      const picked = detail.answers.filter((a) => detail.userAnswerIds.includes(a.id)).map((a) => a.text);
      if (picked.length) body = <Chips items={picked} />;
      break;
    }
    case 'TRUE_FALSE':
      if (typeof r?.value === 'boolean') body = <Chips items={[r.value ? tr('true') : tr('false')]} />;
      break;
    case 'SHORT_TEXT':
    case 'NUMERIC':
      if (r?.text !== undefined || r?.value !== undefined) body = <Chips items={[String(r.text ?? r.value)]} />;
      break;
    case 'ESSAY':
      if (r?.text) return <blockquote className={styles.essay}>{r.text}</blockquote>;
      break;
    case 'MATCHING':
      if (r?.pairs) {
        body = (
          <ul className={styles.pairList}>
            {r.pairs.map((p) => (
              <li key={p.left}>
                {p.left} → {p.right ?? '—'}
              </li>
            ))}
          </ul>
        );
      }
      break;
    case 'ORDERING':
      if (r?.items) {
        body = (
          <ol className={styles.pairList}>
            {r.items.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>
        );
      }
      break;
  }
  return (
    <span className={styles.line}>
      {t('yourAnswer')} {body}
    </span>
  );
}

function RightAnswer({ detail }: { detail: MyTestResultDetail }) {
  const t = useTranslations('test.result');
  const tr = useTranslations('test.runner');
  const c = detail.correct!;
  switch (detail.type) {
    case 'SINGLE':
    case 'MULTIPLE': {
      const missed = detail.answers
        .filter((a) => detail.correctAnswerIds.includes(a.id) && !detail.userAnswerIds.includes(a.id))
        .map((a) => a.text);
      const correct = detail.answers.filter((a) => detail.correctAnswerIds.includes(a.id)).map((a) => a.text);
      return detail.type === 'MULTIPLE' && detail.userAnswerIds.length > 0 && missed.length > 0 ? (
        <span className={styles.line}>
          {t('notChosen')} <Chips items={missed} ok />
        </span>
      ) : (
        <span className={styles.line}>
          {t('rightAnswer')} <Chips items={correct} ok />
        </span>
      );
    }
    case 'TRUE_FALSE':
      return (
        <span className={styles.line}>
          {t('rightAnswer')} <Chips items={[c.value ? tr('true') : tr('false')]} ok />
        </span>
      );
    case 'SHORT_TEXT':
      return (
        <span className={styles.line}>
          {t('acceptedAnswers')} <Chips items={c.accepted ?? []} ok />
        </span>
      );
    case 'NUMERIC':
      return (
        <span className={styles.line}>
          {t('rightAnswer')}{' '}
          <Chips items={[c.tolerance ? `${c.value} ± ${c.tolerance}` : String(c.value)]} ok />
        </span>
      );
    case 'MATCHING':
      return (
        <div className={styles.line}>
          {t('rightPairs')}
          <ul className={styles.pairList}>
            {(c.pairs ?? []).map((p) => (
              <li key={p.left} className={styles.okText}>
                {p.left} → {p.right}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'ORDERING':
      return (
        <div className={styles.line}>
          {t('rightOrder')}
          <ol className={styles.pairList}>
            {(c.items ?? []).map((x) => (
              <li key={x} className={styles.okText}>
                {x}
              </li>
            ))}
          </ol>
        </div>
      );
    default:
      return null;
  }
}
