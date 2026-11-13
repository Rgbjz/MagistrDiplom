'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  ClipboardCheck,
  GraduationCap,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../lib/api/client';
import { fileUrl } from '../../lib/format';
import { useFormat } from '../../i18n/format';
import type { CourseAnalytics, RiskFlag } from '../../lib/types';
import { Avatar, Badge, EmptyState, Progress, ScrollArea, Skeleton, StatCard } from '../ui';
import { Forbidden, QueryError } from '../states';
import { MessageButton } from '../chat/MessageButton';
import { useScaleLabel } from '../gradebook/scale';
import ui from '../teacher/shared.module.scss';
import styles from './analytics.module.scss';

const pctText = (v: number | null) => (v === null ? '—' : `${String(v).replace('.', ',')}%`);

/**
 * Course analytics for the course team: summary, grade distribution, weekly
 * activity, hardest questions, tests/labs and students who need attention.
 * Charts are plain HTML/CSS bars with the numbers written out, so screen
 * readers and print get the same information.
 */
export function AnalyticsView({ courseId, canEdit = false }: { courseId: number; canEdit?: boolean }) {
  const t = useTranslations('analytics');
  const ta = useTranslations('adaptive');
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['course-analytics', courseId],
    queryFn: () => clientApi<CourseAnalytics>(`/courses/${courseId}/analytics`),
  });

  if (isLoading) {
    return (
      <div className={styles.stack} aria-busy="true">
        <Skeleton height={104} radius="var(--radius-lg)" />
        <Skeleton height={260} radius="var(--radius-lg)" />
        <Skeleton height={320} radius="var(--radius-lg)" />
      </div>
    );
  }
  if (isError || !data) {
    return String((error as Error | null)?.message).includes('403') ? (
      <Forbidden title={t('forbidden')} />
    ) : (
      <QueryError error={error} onRetry={() => void refetch()} />
    );
  }
  if (data.summary.students === 0) {
    return (
      <EmptyState icon={<Users size={28} />} title={t('empty')}>
        <p>{t('emptyText')}</p>
      </EmptyState>
    );
  }

  return (
    <div className={styles.stack}>
      <Link href={`/courses/${courseId}/manage?tab=adaptive`} className={styles.link}>
        {ta('analyticsLink')}
      </Link>
      <Summary data={data} />
      <div className={styles.twoCol}>
        <DistributionCard data={data} />
        <WeeklyCard data={data} />
      </div>
      <RiskCard data={data} />
      <HardQuestionsCard data={data} courseId={courseId} canEdit={canEdit} />
      <TestsCard data={data} />
      <LabsCard data={data} />
    </div>
  );
}

function Summary({ data }: { data: CourseAnalytics }) {
  const t = useTranslations('analytics.summary');
  const s = data.summary;
  return (
    <section aria-label={t('label')} className={styles.summary}>
      <StatCard icon={<Users size={20} />} value={s.students} label={t('students')} />
      <StatCard icon={<UserCheck size={20} />} value={s.activeLast7Days} label={t('active')} tone="success" />
      <StatCard icon={<TrendingUp size={20} />} value={pctText(s.avgProgress)} label={t('avgProgress')} />
      <StatCard icon={<GraduationCap size={20} />} value={pctText(s.avgFinal)} label={t('avgFinal')} />
      <StatCard icon={<BarChart3 size={20} />} value={pctText(s.passRate)} label={t('passRate')} tone="success" />
      <StatCard icon={<ClipboardCheck size={20} />} value={s.awaitingGrading} label={t('awaiting')} tone="warning" />
      <StatCard icon={<AlertTriangle size={20} />} value={s.atRisk} label={t('atRisk')} tone="warning" />
    </section>
  );
}

function DistributionCard({ data }: { data: CourseAnalytics }) {
  const t = useTranslations('analytics.distribution');
  const scaleLabel = useScaleLabel();
  const { buckets, ungraded } = data.distribution;
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const scale = data.course.gradingScale;
  const label = (code: string) =>
    scale === 'PERCENT' ? `${code}%` : scale === 'FIVE_POINT' ? code : scaleLabel(scale, code);
  const any = buckets.some((b) => b.count > 0);

  return (
    <section className={`${ui.card} ${ui.cardPad} ${styles.card}`} aria-labelledby="an-dist">
      <h2 id="an-dist" className={ui.h3}>
        {t('title')}
      </h2>
      <p className={ui.muted}>{t('hint')}</p>
      {any ? (
        <ul className={styles.columns} aria-label={t('title')}>
          {buckets.map((b) => (
            <li key={b.code} className={styles.column} aria-label={t('bucket', { label: label(b.code), count: b.count })}>
              <span className={styles.columnValue} aria-hidden="true">
                {b.count}
              </span>
              <span className={styles.columnTrack} aria-hidden="true">
                <span
                  className={`${styles.columnBar} ${b.passing ? styles.pass : styles.fail}`}
                  style={{ height: `${(b.count / max) * 100}%` }}
                />
              </span>
              <span className={styles.columnLabel} aria-hidden="true">
                {label(b.code)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.noData}>{t('noData')}</p>
      )}
      {ungraded > 0 && <p className={ui.muted}>{t('ungraded', { count: ungraded })}</p>}
    </section>
  );
}

function WeeklyCard({ data }: { data: CourseAnalytics }) {
  const t = useTranslations('analytics.weekly');
  const f = useFormat();
  const weeks = data.weekly;
  const total = (w: CourseAnalytics['weekly'][number]) => w.lessons + w.tests + w.submissions;
  const max = Math.max(1, ...weeks.map(total));
  const any = weeks.some((w) => total(w) > 0);
  const short = (iso: string) => {
    const [, m, d] = iso.split('-');
    return `${d}.${m}`;
  };

  return (
    <section className={`${ui.card} ${ui.cardPad} ${styles.card}`} aria-labelledby="an-weekly">
      <h2 id="an-weekly" className={ui.h3}>
        {t('title')}
      </h2>
      <p className={ui.muted}>{t('hint')}</p>
      <ul className={styles.legend} aria-hidden="true">
        <li>
          <span className={`${styles.dot} ${styles.lessons}`} />
          {t('lessons')}
        </li>
        <li>
          <span className={`${styles.dot} ${styles.tests}`} />
          {t('tests')}
        </li>
        <li>
          <span className={`${styles.dot} ${styles.submissions}`} />
          {t('submissions')}
        </li>
      </ul>
      {any ? (
        <ul className={`${styles.columns} ${styles.weeks}`} aria-label={t('title')}>
          {weeks.map((w) => (
            <li
              key={w.weekStart}
              className={styles.column}
              aria-label={t('weekBar', {
                date: f.date(w.weekStart),
                lessons: w.lessons,
                tests: w.tests,
                submissions: w.submissions,
              })}
            >
              <span className={styles.columnValue} aria-hidden="true">
                {total(w) || ''}
              </span>
              <span className={styles.columnTrack} aria-hidden="true">
                <span className={styles.stacked} style={{ height: `${(total(w) / max) * 100}%` }}>
                  {[
                    ['submissions', w.submissions],
                    ['tests', w.tests],
                    ['lessons', w.lessons],
                  ].map(([kind, n]) =>
                    Number(n) > 0 ? (
                      <span
                        key={kind}
                        className={styles[kind as string]}
                        style={{ flexGrow: Number(n) }}
                      />
                    ) : null,
                  )}
                </span>
              </span>
              <span className={styles.columnLabel} aria-hidden="true">
                {short(w.weekStart)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.noData}>{t('noData')}</p>
      )}
    </section>
  );
}

function RiskCard({ data }: { data: CourseAnalytics }) {
  const t = useTranslations('analytics.risk');
  const f = useFormat();
  const scaleLabel = useScaleLabel();
  const flagText = (flag: RiskFlag, overdue: number) =>
    flag === 'overdue' ? t('flag.overdue', { count: overdue }) : t(`flag.${flag}`);
  const tone = (flag: RiskFlag) => (flag === 'lowGrade' || flag === 'overdue' ? 'danger' : 'warning');

  return (
    <section className={`${ui.card} ${styles.card}`} aria-labelledby="an-risk">
      <div className={ui.cardPad}>
        <h2 id="an-risk" className={ui.h3}>
          {t('title')}
        </h2>
        <p className={ui.muted}>{t('hint')}</p>
      </div>
      {data.atRisk.length === 0 ? (
        <p className={`${styles.noData} ${ui.cardPad}`}>{t('none')}</p>
      ) : (
        <ScrollArea className={ui.tableWrap} label={t('title')}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">{t('student')}</th>
                <th scope="col">{t('reasons')}</th>
                <th scope="col">{t('progress')}</th>
                <th scope="col">{t('final')}</th>
                <th scope="col">{t('lastActivity')}</th>
                <th scope="col">
                  <span className="sr-only">{t('student')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.atRisk.map((s) => (
                <tr key={s.userId}>
                  <td>
                    <span className={ui.person}>
                      <Avatar src={fileUrl(s.avatarUrl)} name={s.name} size={32} />
                      <span className={ui.personText}>
                        <span className={ui.personName}>{s.name}</span>
                        <span className={ui.personSub}>{s.email}</span>
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className={styles.flags}>
                      {s.flags.map((flag) => (
                        <Badge key={flag} tone={tone(flag)}>
                          {flagText(flag, s.overdue)}
                        </Badge>
                      ))}
                    </span>
                  </td>
                  <td className={ui.progressCell}>
                    <Progress value={s.progress} label={`${s.name}: ${s.progress}%`} showValue size="sm" />
                  </td>
                  <td className={styles.nowrap}>
                    {s.final === null ? '—' : scaleLabel(data.course.gradingScale, s.scaleCode)}
                  </td>
                  <td className={styles.nowrap}>{s.lastActivity ? f.relative(s.lastActivity) : t('never')}</td>
                  <td>
                    <MessageButton userId={s.userId} name={s.name} />
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

function HardQuestionsCard({
  data,
  courseId,
  canEdit,
}: {
  data: CourseAnalytics;
  courseId: number;
  canEdit: boolean;
}) {
  const t = useTranslations('analytics.hard');
  const tt = useTranslations('test.runner.type');

  return (
    <section className={`${ui.card} ${styles.card}`} aria-labelledby="an-hard">
      <div className={`${ui.cardPad} ${ui.sectionHead}`}>
        <div>
          <h2 id="an-hard" className={ui.h3}>
            {t('title')}
          </h2>
          <p className={ui.muted}>{t('hint')}</p>
        </div>
        {canEdit && data.hardQuestions.length > 0 && (
          <Link href={`/teacher/courses/${courseId}/builder`} className={styles.link}>
            {t('edit')}
          </Link>
        )}
      </div>
      {data.hardQuestions.length === 0 ? (
        <p className={`${styles.noData} ${ui.cardPad}`}>{t('noData')}</p>
      ) : (
        <ScrollArea className={ui.tableWrap} label={t('title')}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">{t('question')}</th>
                <th scope="col">{t('test')}</th>
                <th scope="col">{t('type')}</th>
                <th scope="col">{t('attempts')}</th>
                <th scope="col">{t('correct')}</th>
              </tr>
            </thead>
            <tbody>
              {data.hardQuestions.map((q) => (
                <tr key={q.id}>
                  <td className={styles.question}>{q.text}</td>
                  <td>{q.testTitle}</td>
                  <td className={styles.nowrap}>{tt(q.type as 'SINGLE')}</td>
                  <td>{q.attempts}</td>
                  <td>
                    <span className={styles.rate}>
                      <span className={styles.rateTrack} aria-hidden="true">
                        <span
                          className={`${styles.rateBar} ${q.correctRate < 50 ? styles.fail : styles.pass}`}
                          style={{ width: `${q.correctRate}%` }}
                        />
                      </span>
                      {q.correctRate}%
                    </span>
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

function TestsCard({ data }: { data: CourseAnalytics }) {
  const t = useTranslations('analytics.tests');
  return (
    <section className={`${ui.card} ${styles.card}`} aria-labelledby="an-tests">
      <h2 id="an-tests" className={`${ui.h3} ${ui.cardPad}`}>
        {t('title')}
      </h2>
      {data.tests.length === 0 ? (
        <p className={`${styles.noData} ${ui.cardPad}`}>{t('none')}</p>
      ) : (
        <ScrollArea className={ui.tableWrap} label={t('title')}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">{t('name')}</th>
                <th scope="col">{t('attempts')}</th>
                <th scope="col">{t('students')}</th>
                <th scope="col">{t('avg')}</th>
                <th scope="col">{t('passRate')}</th>
              </tr>
            </thead>
            <tbody>
              {data.tests.map((x) => (
                <tr key={x.id}>
                  <td>{x.title}</td>
                  <td>{x.attempts}</td>
                  <td>{x.students}</td>
                  <td>{pctText(x.avgScore)}</td>
                  <td>{pctText(x.passRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </section>
  );
}

function LabsCard({ data }: { data: CourseAnalytics }) {
  const t = useTranslations('analytics.labs');
  const f = useFormat();
  return (
    <section className={`${ui.card} ${styles.card}`} aria-labelledby="an-labs">
      <h2 id="an-labs" className={`${ui.h3} ${ui.cardPad}`}>
        {t('title')}
      </h2>
      {data.assignments.length === 0 ? (
        <p className={`${styles.noData} ${ui.cardPad}`}>{t('none')}</p>
      ) : (
        <ScrollArea className={ui.tableWrap} label={t('title')}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">{t('name')}</th>
                <th scope="col">{t('due')}</th>
                <th scope="col">{t('submitted')}</th>
                <th scope="col">{t('awaiting')}</th>
                <th scope="col">{t('graded')}</th>
                <th scope="col">{t('returned')}</th>
                <th scope="col">{t('overdue')}</th>
                <th scope="col">{t('avg')}</th>
              </tr>
            </thead>
            <tbody>
              {data.assignments.map((a) => (
                <tr key={a.id}>
                  <td>{a.title}</td>
                  <td className={styles.nowrap}>{a.dueAt ? f.date(a.dueAt) : t('noDue')}</td>
                  <td>{a.submitted}</td>
                  <td>{a.awaiting > 0 ? <Badge tone="warning">{a.awaiting}</Badge> : 0}</td>
                  <td>{a.graded}</td>
                  <td>{a.returned}</td>
                  <td>{a.overdue > 0 ? <Badge tone="danger">{a.overdue}</Badge> : 0}</td>
                  <td className={styles.nowrap}>
                    {a.avgScore === null ? '—' : `${String(a.avgScore).replace('.', ',')} / ${a.maxScore}`}
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
