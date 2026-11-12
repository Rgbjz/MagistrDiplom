'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  ClipboardCheck,
  Inbox,
  Plus,
  Users,
  BookOpen,
} from 'lucide-react';
import { clientApi } from '../../../lib/api/client';
import { useLocale, useTranslations } from 'next-intl';
import { fileUrl } from '../../../lib/format';
import { useApiErrorMessage, useFormat } from '../../../i18n/format';
import { INTL_LOCALE, type Locale } from '../../../i18n/config';
import type { DashboardData, PendingRequest, SessionUser } from '../../../lib/types';
import {
  Avatar,
  Badge,
  Button,
  CourseCover,
  EmptyState,
  PageHeader,
  Progress,
  Skeleton,
  StatCard,
  useToast,
  ScrollArea,
} from '../../ui';
import { LinkButton } from '../../states/LinkButton';
import { NetworkError } from '../../states';
import ui from '../shared.module.scss';
import styles from './TeacherDashboard.module.scss';

export function TeacherDashboard({ user }: { user: SessionUser }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const t = useTranslations('teacher.dashboard');
  const errorText = useApiErrorMessage();
  const f = useFormat();
  const { data, isLoading, isError, refetch } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => clientApi<DashboardData>('/dashboard'),
  });

  const decide = useMutation({
    mutationFn: ({ r, action }: { r: PendingRequest; action: 'approve' | 'reject' }) =>
      clientApi(`/courses/${r.courseId}/enroll/${r.userId}/${action}`, {
        method: 'POST',
      }),
    onSuccess: (_d, { r, action }) => {
      toast(action === 'approve' ? t('approved', { name: r.name }) : t('rejected', { name: r.name }));
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  if (isError) {
    return (
      <div className="container">
        <NetworkError onRetry={() => refetch()} />
      </div>
    );
  }

  const stats = data?.teacherStats;
  const pending = data?.pendingRequests ?? [];
  const attention = data?.attentionTests ?? [];
  const greetingName = data?.name || user.email;

  const subtitleParts: string[] = [];
  if (stats?.pendingRequests) {
    subtitleParts.push(t('pendingSummary', { count: stats.pendingRequests }));
  }
  if (attention.length) {
    subtitleParts.push(t('attentionSummary', { count: attention.length }));
  }

  return (
    <div className="container">
      <PageHeader
        title={t('greeting', { name: greetingName })}
        subtitle={
          isLoading
            ? t('loading')
            : subtitleParts.length === 2
              ? t('summaryAnd', { first: subtitleParts[0], second: subtitleParts[1] })
              : subtitleParts.length === 1
                ? t('summaryOne', { first: subtitleParts[0] })
                : t('allClear')
        }
        actions={
          <LinkButton href="/teacher/courses/new">
            <Plus size={18} aria-hidden="true" />
            {t('createCourse')}
          </LinkButton>
        }
      />

      <section aria-label={t('statsAria')} className={ui.stats}>
        {isLoading || !stats ? (
          Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height={86} radius="var(--radius-lg)" />
          ))
        ) : (
          <>
            <StatCard icon={<Users size={22} />} value={stats.students} label={t('stats.students')} />
            <StatCard
              icon={<BookOpen size={22} />}
              value={stats.activeCourses}
              label={t('stats.activeCourses')}
              tone="success"
            />
            <StatCard
              icon={<Inbox size={22} />}
              value={stats.pendingRequests}
              label={t('stats.newRequests')}
              tone="warning"
            />
            <StatCard
              icon={<BarChart3 size={22} />}
              value={stats.avgScore === null ? '—' : `${stats.avgScore}%`}
              label={t('stats.avgScore')}
            />
          </>
        )}
      </section>

      <div className={ui.twoCol}>
        <div className={ui.main}>
          <section className={ui.card}>
            <div className={`${ui.sectionHead} ${ui.cardPad}`}>
              <h2 className={ui.h2}>{t('myCourses')}</h2>
            </div>
            {isLoading ? (
              <div className={ui.cardPad}>
                <Skeleton height={160} />
              </div>
            ) : (data?.teachingCourses ?? []).length === 0 ? (
              <EmptyState icon={<BookOpen size={40} />} title={t('noCourses')}>
                <LinkButton href="/teacher/courses/new">{t('createFirst')}</LinkButton>
              </EmptyState>
            ) : (
              <ScrollArea className={ui.tableWrap}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th scope="col">{t('table.course')}</th>
                      <th scope="col">{t('table.students')}</th>
                      <th scope="col">{t('table.avgProgress')}</th>
                      <th scope="col">{t('table.status')}</th>
                      <th scope="col">
                        <span className="sr-only">{t('table.actions')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.teachingCourses ?? []).map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div className={ui.person}>
                            <div className={ui.miniCover}>
                              <CourseCover
                                id={c.id}
                                imageUrl={fileUrl(c.imageUrl)}
                                title={c.title}
                                height={44}
                              />
                            </div>
                            <div className={ui.personText}>
                              <span className={ui.personName}>{c.title}</span>
                              <span className={ui.personSub}>
                                {f.price(c.price)}
                                {c.pendingCount > 0 && ` · ${t('requestsCount', { count: c.pendingCount })}`}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>{c.published ? c.studentsCount : '—'}</td>
                        <td className={ui.progressCell}>
                          {c.published ? (
                            <Progress value={c.avgProgress} showValue size="sm" label={t('table.avgProgress')} />
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          {c.published ? (
                            <Badge tone="success">{t('published')}</Badge>
                          ) : (
                            <Badge>{t('draft')}</Badge>
                          )}
                          {c.myRole && c.myRole !== 'OWNER' && (
                            <>
                              {' '}
                              <Badge tone="primary">{t(`teamRole.${c.myRole}`)}</Badge>
                            </>
                          )}
                        </td>
                        <td>
                          <div className={ui.rowActions}>
                            {c.myRole !== 'ASSISTANT' && (
                              <LinkButton
                                href={`/teacher/courses/${c.id}/builder`}
                                variant="outline"
                                size="sm"
                              >
                                {t('edit')}
                              </LinkButton>
                            )}
                            <LinkButton href={`/courses/${c.id}/manage`} variant="ghost" size="sm">
                              {t('manage')}
                            </LinkButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            )}
          </section>

          <section className={`${ui.card} ${ui.cardPad} ${styles.chartCard}`}>
            <div className={ui.sectionHead}>
              <h2 className={ui.h2}>{t('activityTitle')}</h2>
              <span className={ui.muted}>{t('activitySub')}</span>
            </div>
            {isLoading ? (
              <Skeleton height={180} />
            ) : (
              <WeeklyChart days={data?.weeklyActivity ?? []} />
            )}
          </section>
        </div>

        <aside className={ui.aside}>
          <section className={ui.card}>
            <div className={`${ui.sectionHead} ${ui.cardPad}`}>
              <h2 className={ui.h3}>{t('requestsTitle')}</h2>
              {pending.length > 0 && <Badge tone="warning">{pending.length}</Badge>}
            </div>
            {isLoading ? (
              <div className={ui.cardPad}>
                <Skeleton height={120} />
              </div>
            ) : pending.length === 0 ? (
              <p className={`${ui.muted} ${styles.emptyNote}`}>{t('noRequests')}</p>
            ) : (
              <ul className={`${ui.list} ${styles.plain}`}>
                {pending.map((r) => (
                  <li key={`${r.courseId}-${r.userId}`} className={ui.listItem}>
                    <div className={`${ui.person} ${ui.grow}`}>
                      <Avatar src={fileUrl(r.avatarUrl)} name={r.name} size={40} />
                      <div className={ui.personText}>
                        <span className={ui.personName}>{r.name}</span>
                        <span className={ui.personSub}>
                          {r.courseTitle} · {f.relative(r.requestedAt)}
                        </span>
                      </div>
                    </div>
                    <div className={ui.rowActions}>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ r, action: 'reject' })}
                        aria-label={t('rejectAria', { name: r.name })}
                      >
                        {t('reject')}
                      </Button>
                      <Button
                        size="sm"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ r, action: 'approve' })}
                      >
                        {t('approve')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={ui.card}>
            <div className={`${ui.sectionHead} ${ui.cardPad}`}>
              <h2 className={ui.h3}>{t('attentionTitle')}</h2>
            </div>
            {isLoading ? (
              <div className={ui.cardPad}>
                <Skeleton height={100} />
              </div>
            ) : attention.length === 0 ? (
              <p className={`${ui.muted} ${styles.emptyNote}`}>
                {t('attentionNone')}
              </p>
            ) : (
              <ul className={`${ui.list} ${styles.plain}`}>
                {attention.map((test) => (
                  <li key={test.testId} className={ui.listItem}>
                    <span className={styles.testIcon} aria-hidden="true">
                      <ClipboardCheck size={20} />
                    </span>
                    <div className={`${ui.personText} ${ui.grow}`}>
                      <span className={ui.personName}>{test.title}</span>
                      <span className={ui.personSub}>
                        {t('attentionMeta', {
                          course: test.courseTitle,
                          rate: test.passRate,
                          count: test.attempts,
                        })}
                      </span>
                    </div>
                    <LinkButton
                      href={`/courses/${test.courseId}/manage?tab=tests`}
                      variant="outline"
                      size="sm"
                    >
                      {t('view')}
                    </LinkButton>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Link href="/chat" className={styles.chatLink}>
            {t('openChat')}
          </Link>
        </aside>
      </div>
    </div>
  );
}

function WeeklyChart({ days }: { days: { date: string; label: string; count: number }[] }) {
  const t = useTranslations('teacher.dashboard');
  const locale = useLocale() as Locale;
  // The API sends Ukrainian weekday labels; other locales format the date.
  const dayLabel = (d: { date: string; label: string }) =>
    locale === 'uk'
      ? d.label
      : new Date(d.date).toLocaleDateString(INTL_LOCALE[locale], { weekday: 'short' });
  if (days.length === 0) {
    return <p className={ui.muted}>{t('chartEmpty')}</p>;
  }
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((s, d) => s + d.count, 0);
  return (
    <figure className={styles.chart}>
      <figcaption className="sr-only">
        {t('chartCaption', { total })}
      </figcaption>
      <ul className={styles.bars}>
        {days.map((d) => (
          <li key={d.date} className={styles.barCol}>
            <span className={styles.barValue}>{d.count}</span>
            <span className={styles.barTrack}>
              <span
                className={styles.bar}
                style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
                aria-hidden="true"
              />
            </span>
            <span className={styles.barLabel}>
              <span aria-hidden="true">{dayLabel(d)}</span>
              <span className="sr-only">
                {t('chartBar', { day: dayLabel(d), count: d.count })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
