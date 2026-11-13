'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  BarChart3,
  BookOpen,
  Check,
  Clock,
  FileUp,
  MessageCircle,
  Play,
  Search,
  CalendarDays,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../../lib/api/client';
import { fileUrl } from '../../../lib/format';
import { useDeadline, useFormat, useTestLabels } from '../../../i18n/format';
import type { CalendarResponse } from '../../../lib/types';
import type {
  ContinueCourse,
  CourseListItem,
  DashboardData,
  SessionUser,
} from '../../../lib/types';
import {

  CourseCover,
  EmptyState,
  PageHeader,
  Progress,
  Skeleton,
  StatCard,
} from '../../ui';
import { DashboardRecommendations } from '../../adaptive/DashboardRecommendations';
import styles from './StudentDashboard.module.scss';

function greetingKey(): 'night' | 'morning' | 'day' | 'evening' {
  const h = new Date().getHours();
  if (h < 5) return 'night';
  if (h < 12) return 'morning';
  if (h < 18) return 'day';
  return 'evening';
}

export function StudentDashboard({ user }: { user: SessionUser }) {
  const t = useTranslations('dashboard');
  const f = useFormat();
  const tests = useTestLabels();
  const deadlineOf = useDeadline();
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => clientApi<DashboardData>('/dashboard'),
  });
  const { data: courses } = useQuery<CourseListItem[]>({
    queryKey: ['courses', 'teaser'],
    queryFn: () => clientApi<CourseListItem[]>('/courses'),
  });

  const name = data?.name || user.email.split('@')[0];
  const continueList = data?.continueLearning ?? [];
  const upcoming = data?.upcomingTests ?? [];
  const assignments = data?.upcomingAssignments ?? [];
  const tc = useTranslations('calendar');
  const { data: calendar } = useQuery<CalendarResponse>({
    queryKey: ['calendar', 'dashboard'],
    queryFn: () => {
      const from = new Date();
      const to = new Date(from.getTime() + 30 * 86_400_000);
      return clientApi<CalendarResponse>(
        `/calendar?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      );
    },
  });
  // Course events (assignment deadlines are already listed above).
  const events = (calendar?.items ?? []).filter((i) => i.kind !== 'ASSIGNMENT').slice(0, 3);
  const chats = data?.recentConversations ?? [];
  // Not courses the student already takes or helps teach as an assistant.
  const suggestions = (courses ?? [])
    .filter((c) => !c.enrollmentStatus && !c.isStaff && c.published !== false)
    .slice(0, 4);

  const summary =
    continueList.length || upcoming.length
      ? upcoming.length
        ? t('summary.coursesAndTests', { courses: continueList.length, tests: upcoming.length })
        : t('summary.courses', { courses: continueList.length })
      : t('summary.empty');

  return (
    <div className="container">
      <PageHeader
        title={t('greeting.title', { greeting: t(`greeting.${greetingKey()}`), name })}
        subtitle={isLoading ? ' ' : summary}
        actions={
          <Link href="/catalog" className={styles.primaryBtn}>
            <Search size={18} aria-hidden="true" />
            {t('findCourse')}
          </Link>
        }
      />

      <section aria-label={t('stats.label')} className={styles.stats}>
        {isLoading || !data?.stats ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} height={86} radius="var(--radius-lg)" />)
        ) : (
          <>
            <StatCard icon={<BookOpen size={22} aria-hidden="true" />} value={data.stats.enrolled} label={t('stats.enrolled')} />
            <StatCard
              icon={<Award size={22} aria-hidden="true" />}
              value={data.stats.completed}
              label={t('stats.completed', { count: data.stats.completed })}
              tone="success"
            />
            <StatCard icon={<Check size={22} aria-hidden="true" />} value={data.stats.lessonsCompleted} label={t('stats.lessonsCompleted')} />
            <StatCard
              icon={<BarChart3 size={22} aria-hidden="true" />}
              value={data.stats.avgScore !== null ? `${data.stats.avgScore}%` : '—'}
              label={t('stats.avgScore')}
              tone="warning"
            />
          </>
        )}
      </section>

      <DashboardRecommendations />

      <div className={styles.columns}>
        <section className={styles.main} aria-labelledby="continue-title">
          <div className={styles.sectionHead}>
            <h2 id="continue-title" className={styles.h2}>
              {t('continue.title')}
            </h2>
            <Link href="/my-courses" className={styles.more}>
              {t('continue.allCourses')}
            </Link>
          </div>
          {isLoading ? (
            <Skeleton height={128} radius="var(--radius-lg)" />
          ) : continueList.length === 0 ? (
            <EmptyState icon={<BookOpen size={28} aria-hidden="true" />} title={t('continue.empty')}>
              <Link href="/catalog" className={styles.outlineBtn}>
                {t('continue.toCatalog')}
              </Link>
            </EmptyState>
          ) : (
            continueList.slice(0, 3).map((c) => <ContinueCard key={c.id} c={c} />)
          )}
        </section>

        <aside className={styles.aside} aria-labelledby="upcoming-title">
          <div className={styles.sectionHead}>
            <h2 id="upcoming-title" className={styles.h2}>
              {t('upcoming.title')}
            </h2>
            <Link href="/calendar" className={styles.more}>
              {t('upcoming.calendarLink')}
            </Link>
          </div>
          <div className={styles.list}>
            {isLoading ? (
              <div className={styles.listPad}>
                <Skeleton height={48} />
              </div>
            ) : upcoming.length === 0 &&
              assignments.length === 0 &&
              events.length === 0 &&
              chats.length === 0 ? (
              <p className={styles.listEmpty}>{t('upcoming.empty')}</p>
            ) : (
              <>
                {events.map((e) => (
                  <Link
                    key={e.id}
                    href={`/calendar?date=${e.startsAt.slice(0, 10)}`}
                    className={styles.row}
                  >
                    <span className={`${styles.rowIcon} ${styles.event}`}>
                      <CalendarDays size={20} aria-hidden="true" />
                    </span>
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>
                        {tc(`kind.${e.kind}`)}: {e.title}
                      </span>
                      <span className={styles.rowSub}>
                        {e.courseTitle} · {f.dateTime(e.startsAt)}
                      </span>
                    </span>
                  </Link>
                ))}
                {upcoming.map((u) => (
                  <Link key={`t-${u.testId}`} href={`/courses/${u.courseId}?test=${u.testId}`} className={styles.row}>
                    <span className={`${styles.rowIcon} ${styles.warn}`}>
                      <Clock size={20} aria-hidden="true" />
                    </span>
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>
                        {tests.label(u.title)}
                      </span>
                      <span className={styles.rowSub}>
                        {t('upcoming.testMeta', {
                          course: u.courseTitle,
                          count: u.questionsCount,
                          minutes: u.timeLimit,
                        })}
                      </span>
                    </span>
                  </Link>
                ))}
                {assignments.map((a) => {
                  const deadline = deadlineOf(a.dueAt);
                  return (
                    <Link
                      key={`a-${a.assignmentId}`}
                      href={`/courses/${a.courseId}?assignment=${a.assignmentId}`}
                      className={styles.row}
                    >
                      <span className={`${styles.rowIcon} ${styles.soft}`}>
                        <FileUp size={20} aria-hidden="true" />
                      </span>
                      <span className={styles.rowText}>
                        <span className={styles.rowTitle}>{t('upcoming.assignment', { title: a.title })}</span>
                        <span className={styles.rowSub}>
                          {a.courseTitle}
                          {a.status === 'SUBMITTED'
                            ? t('upcoming.submitted')
                            : a.status === 'RETURNED'
                              ? t('upcoming.returned')
                              : deadline
                                ? ` · ${deadline.text}`
                                : ''}
                        </span>
                      </span>
                    </Link>
                  );
                })}
                {chats.slice(0, 3).map((c) => (
                  <Link key={`c-${c.id}`} href={`/chat?c=${c.id}`} className={styles.row}>
                    <span className={`${styles.rowIcon} ${styles.soft}`}>
                      <MessageCircle size={20} aria-hidden="true" />
                    </span>
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>
                        {c.type === 'COURSE' ? t('upcoming.courseChat', { title: c.title }) : c.title}
                      </span>
                      <span className={styles.rowSub}>
                        {c.lastMessage
                          ? `${c.lastMessage.content} · ${f.relative(c.lastMessage.createdAt)}`
                          : t('upcoming.noMessages')}
                      </span>
                    </span>
                  </Link>
                ))}
              </>
            )}
          </div>
        </aside>
      </div>

      {(data?.assistingCourses ?? []).length > 0 && (
        <section aria-labelledby="assisting-title" className={styles.catalog}>
          <div className={styles.sectionHead}>
            <h2 id="assisting-title" className={styles.h2}>
              {t('assisting.title')}
            </h2>
          </div>
          <div className={styles.grid}>
            {(data?.assistingCourses ?? []).map((c) => (
              <Link key={c.id} href={`/courses/${c.id}/manage`} className={styles.courseCard}>
                <CourseCover id={c.id} title={c.title} imageUrl={fileUrl(c.imageUrl)} />
                <span className={styles.courseBody}>
                  <span className={styles.courseTitle}>{c.title}</span>
                  <span className={styles.courseDesc}>
                    {t(`assisting.role.${c.role}`)} · {t('assisting.open')}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {suggestions.length > 0 && (
        <section aria-labelledby="catalog-title" className={styles.catalog}>
          <div className={styles.sectionHead}>
            <h2 id="catalog-title" className={styles.h2}>
              {t('suggestions.title')}
            </h2>
            <Link href="/catalog" className={styles.more}>
              {t('suggestions.allCatalog')}
            </Link>
          </div>
          <div className={styles.grid}>
            {suggestions.map((c) => (
              <Link key={c.id} href={`/c/${c.id}`} className={styles.courseCard}>
                <CourseCover id={c.id} title={c.title} imageUrl={fileUrl(c.imageUrl)}>
                  <span className={styles.price}>{f.price(c.price)}</span>
                </CourseCover>
                <span className={styles.courseBody}>
                  <span className={styles.courseTitle}>{c.title}</span>
                  {c.description && <span className={styles.courseDesc}>{c.description}</span>}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ContinueCard({ c }: { c: ContinueCourse }) {
  const t = useTranslations('dashboard');
  const href = c.nextLesson ? `/courses/${c.id}?lesson=${c.nextLesson.id}` : `/courses/${c.id}`;
  return (
    <article className={styles.continue}>
      <div className={styles.continueCover}>
        <CourseCover id={c.id} title={c.title} imageUrl={fileUrl(c.imageUrl)} height={96} />
      </div>
      <div className={styles.continueBody}>
        <span className={styles.eyebrow}>
          {t('continue.passed', { done: c.completedLessons, total: c.totalLessons })}
        </span>
        <h3 className={styles.h3}>{c.title}</h3>
        {c.nextLesson && <p className={styles.next}>{t('continue.next', { title: c.nextLesson.title })}</p>}
        <Progress value={c.percent} showValue label={t('continue.progressLabel')} />
      </div>
      <Link href={href} className={styles.primaryBtn}>
        <Play size={16} fill="currentColor" aria-hidden="true" />
        {c.completedLessons > 0 ? t('continue.continue') : t('continue.start')}
      </Link>
    </article>
  );
}

