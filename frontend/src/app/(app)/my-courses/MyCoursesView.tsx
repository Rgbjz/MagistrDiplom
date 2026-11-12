'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Award, BookOpen, Clock } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { clientApi } from '../../../lib/api/client';
import { fileUrl } from '../../../lib/format';
import { useApiErrorMessage, useFormat } from '../../../i18n/format';
import type { MyCourse } from '../../../lib/types';
import {
  Badge,
  Button,
  CourseCover,
  EmptyState,
  PageHeader,
  Progress,
  Select,
  Skeleton,
  Tabs,
  useToast,
} from '../../../components/ui';
import styles from './my-courses.module.scss';
import { track } from '../../../lib/analytics';

type Tab = 'active' | 'pending' | 'completed';
type Sort = 'activity' | 'progress' | 'title';

function isCompleted(c: MyCourse) {
  return c.status === 'COMPLETED' || (c.status === 'ACTIVE' && c.progress.total > 0 && c.progress.percent >= 100);
}

function tabOf(c: MyCourse): Tab {
  if (c.status === 'PENDING' || c.status === 'REJECTED') return 'pending';
  return isCompleted(c) ? 'completed' : 'active';
}

function sorter(sort: Sort, locale: string): (a: MyCourse, b: MyCourse) => number {
  if (sort === 'progress') return (a, b) => b.progress.percent - a.progress.percent;
  if (sort === 'title') return (a, b) => a.course.title.localeCompare(b.course.title, locale);
  return (a, b) =>
    new Date(b.lastActivityAt ?? b.enrolledAt).getTime() -
    new Date(a.lastActivityAt ?? a.enrolledAt).getTime();
}

export function MyCoursesView() {
  const t = useTranslations('dashboard.myCourses');
  const locale = useLocale();
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = search.get('tab');
  const tab: Tab = raw === 'pending' || raw === 'completed' ? raw : 'active';
  const [sort, setSort] = useState<Sort>('activity');

  const { data, isLoading, isError } = useQuery<MyCourse[]>({
    queryKey: ['my-courses'],
    queryFn: () => clientApi<MyCourse[]>('/users/me/courses'),
  });

  const groups = useMemo(() => {
    const g: Record<Tab, MyCourse[]> = { active: [], pending: [], completed: [] };
    for (const c of data ?? []) g[tabOf(c)].push(c);
    for (const k of Object.keys(g) as Tab[]) g[k].sort(sorter(sort, locale));
    return g;
  }, [data, sort, locale]);

  const list = groups[tab];

  return (
    <div className="container">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <label className={styles.sort}>
            {t('sort.label')}
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="activity">{t('sort.activity')}</option>
              <option value="progress">{t('sort.progress')}</option>
              <option value="title">{t('sort.title')}</option>
            </Select>
          </label>
        }
      />

      <Tabs<Tab>
        label={t('tabs.label')}
        value={tab}
        onChange={(next) => router.replace(`${pathname}?tab=${next}`, { scroll: false })}
        items={[
          { value: 'active', label: t('tabs.active'), count: groups.active.length },
          { value: 'pending', label: t('tabs.pending'), count: groups.pending.length },
          { value: 'completed', label: t('tabs.completed'), count: groups.completed.length },
        ]}
      />

      {isLoading ? (
        <div className={styles.grid}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={210} radius="var(--radius-lg)" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState title={t('loadError')}>
          <p className={styles.muted}>{t('loadErrorHint')}</p>
        </EmptyState>
      ) : list.length === 0 ? (
        <EmptyState icon={<BookOpen size={28} aria-hidden="true" />} title={t(`empty.${tab}`)}>
          <Link href="/catalog" className={styles.primaryBtn}>
            {t('toCatalog')}
          </Link>
        </EmptyState>
      ) : (
        <div className={styles.grid}>
          {list.map((c) =>
            tab === 'active' ? (
              <ActiveCard key={c.course.id} c={c} />
            ) : tab === 'pending' ? (
              <PendingCard key={c.course.id} c={c} />
            ) : (
              <CompletedCard key={c.course.id} c={c} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function CardHead({ c, meta }: { c: MyCourse; meta: string }) {
  return (
    <div className={styles.head}>
      <div className={styles.thumb}>
        <CourseCover id={c.course.id} title={c.course.title} imageUrl={fileUrl(c.course.imageUrl)} height={56} />
      </div>
      <div className={styles.headText}>
        <h2 className={styles.title}>{c.course.title}</h2>
        <span className={styles.meta}>{meta}</span>
      </div>
    </div>
  );
}

function ActiveCard({ c }: { c: MyCourse }) {
  const t = useTranslations('dashboard.myCourses');
  const f = useFormat();
  const { completed, total, percent } = c.progress;
  const started = completed > 0;
  const href = c.nextLesson
    ? `/courses/${c.course.id}?lesson=${c.nextLesson.id}`
    : `/courses/${c.course.id}`;
  return (
    <article className={styles.card}>
      <CardHead
        c={c}
        meta={t('lessonsMeta', { teacher: c.course.teacher.name, done: completed, total })}
      />
      <Progress value={percent} showValue />
      <div className={styles.details}>
        {c.nextLesson && (
          <span>
            {t.rich(started ? 'next' : 'firstLesson', {
              title: c.nextLesson.title,
              b: (chunks) => <b>{chunks}</b>,
            })}
          </span>
        )}
        <span>
          {c.lastActivityAt
            ? t('lastActivity', { when: f.relative(c.lastActivityAt) })
            : t('enrolledAt', { date: f.date(c.enrolledAt) })}
        </span>
      </div>
      <div className={styles.row}>
        <Link href={href} className={styles.primaryBtn}>
          {started ? t('continue') : t('start')}
        </Link>
        <Link href={`/courses/${c.course.id}/grades`} className={styles.outlineBtn}>
          {t('myGrades')}
        </Link>
      </div>
    </article>
  );
}

function PendingCard({ c }: { c: MyCourse }) {
  const t = useTranslations('dashboard.myCourses');
  const f = useFormat();
  const rejected = c.status === 'REJECTED';
  return (
    <article className={styles.card}>
      <CardHead c={c} meta={t('requestedAt', { teacher: c.course.teacher.name, date: f.date(c.enrolledAt) })} />
      <div>
        <Badge tone={rejected ? 'danger' : 'warning'}>
          <Clock size={14} aria-hidden="true" />
          {rejected ? t('rejected') : t('pendingBadge')}
        </Badge>
      </div>
      <p className={styles.muted}>
        {rejected
          ? t('rejectedHint')
          : t('pendingHint')}
      </p>
      <Link href={`/c/${c.course.id}`} className={styles.outlineBtn}>
        {t('coursePage')}
      </Link>
    </article>
  );
}

function CompletedCard({ c }: { c: MyCourse }) {
  const t = useTranslations('dashboard.myCourses');
  const f = useFormat();
  const errorText = useApiErrorMessage();
  const router = useRouter();
  const toast = useToast();
  const issue = useMutation({
    mutationFn: () =>
      clientApi<{ code: string }>(`/courses/${c.course.id}/certificate`, { method: 'POST' }),
    onSuccess: (cert) => {
      track('certificate_issued', { course_id: String(c.course.id) });
      router.push(`/certificates/${cert.code}?new=1`);
    },
    onError: (e) => toast(errorText(e, t('certificateError')), 'error'),
  });

  return (
    <article className={styles.card}>
      <CardHead
        c={c}
        meta={
          c.completedAt
            ? t('completedAt', { teacher: c.course.teacher.name, date: f.date(c.completedAt) })
            : c.course.teacher.name
        }
      />
      <div className={styles.badges}>
        <Badge tone="success">{t('completedBadge')}</Badge>
        {c.avgScore !== null && <Badge tone="neutral">{t('avgScore', { score: c.avgScore })}</Badge>}
      </div>
      <div className={styles.row}>
        {c.certificateCode ? (
          <Link href={`/certificates/${c.certificateCode}`} className={styles.primaryBtn}>
            <Award size={18} aria-hidden="true" />
            {t('certificate')}
          </Link>
        ) : (
          <Button loading={issue.isPending} onClick={() => issue.mutate()}>
            <Award size={18} aria-hidden="true" />
            {t('getCertificate')}
          </Button>
        )}
        <Link href={`/courses/${c.course.id}`} className={styles.outlineBtn}>
          {t('view')}
        </Link>
        <Link href={`/courses/${c.course.id}/grades`} className={styles.outlineBtn}>
          {t('myGrades')}
        </Link>
      </div>
    </article>
  );
}
