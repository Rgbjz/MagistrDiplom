'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, MessageCircle, Search, Users } from 'lucide-react';
import { clientApi } from '../../../../../lib/api/client';
import { useTranslations } from 'next-intl';
import { fileUrl } from '../../../../../lib/format';
import { useApiErrorMessage, useFormat, useLabels } from '../../../../../i18n/format';
import type {
  CourseDetail,
  EnrollRequest,
  EnrollmentStatus,
  SessionUser,
  StudentProgress,
  TestSummary,
} from '../../../../../lib/types';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Progress,
  Select,
  Skeleton,
  Tabs,
  useToast,
  ScrollArea,
} from '../../../../../components/ui';
import { EnrollRequests } from '../../../../../components/teacher/EnrollRequests';
import { AssignmentsTab } from '../../../../../components/teacher/AssignmentsTab';
import { GradebookTab } from '../../../../../components/gradebook/GradebookTab';
import { TeamTab } from '../../../../../components/teacher/TeamTab';
import { EssayReviews } from '../../../../../components/teacher/EssayReviews';
import { canCourse } from '../../../../../lib/courseRole';
import { Forbidden, NetworkError, QueryError, NoResults } from '../../../../../components/states';
import { LinkButton } from '../../../../../components/states/LinkButton';
import ui from '../../../../../components/teacher/shared.module.scss';
import styles from './management.module.scss';

type Tab = 'requests' | 'students' | 'tests' | 'assignments' | 'gradebook' | 'team';

const TABS: Tab[] = ['requests', 'students', 'tests', 'assignments', 'gradebook', 'team'];
const asTab = (v: string | null): Tab => (TABS.includes(v as Tab) ? (v as Tab) : 'students');

const STATUSES: EnrollmentStatus[] = ['PENDING', 'ACTIVE', 'REJECTED', 'COMPLETED'];

const STATUS_TONE: Record<EnrollmentStatus, 'success' | 'warning' | 'danger' | 'primary'> = {
  ACTIVE: 'primary',
  PENDING: 'warning',
  REJECTED: 'danger',
  COMPLETED: 'success',
};

interface TestResultRow {
  userId: number;
  userName: string;
  email: string;
  attempt: number;
  score: number | null;
  passed: boolean | null;
  pendingReview?: boolean;
  finishedAt: string | null;
}

export function ManagementView() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const t = useTranslations('manage.page');
  const urlTab = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(asTab(urlTab));
  // Follow in-app links like ?tab=assignments from the gradebook.
  useEffect(() => {
    setTab(asTab(urlTab));
  }, [urlTab]);

  const {
    data: course,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<CourseDetail>({
    queryKey: ['course', id],
    queryFn: () => clientApi<CourseDetail>(`/courses/${id}`),
  });
  const user = session?.user as SessionUser | undefined;
  // Any course-team member may open Manage; editing content is TEACHER/OWNER only.
  const myRole = course?.myRole ?? null;
  const isOwner = !!user && canCourse(myRole, 'view');
  const canEditContent = canCourse(myRole, 'content');

  const { data: students } = useQuery<StudentProgress[]>({
    queryKey: ['studentsProgress', id],
    queryFn: () => clientApi<StudentProgress[]>(`/courses/${id}/students/progress`),
    enabled: isOwner,
  });
  const { data: requests } = useQuery<EnrollRequest[]>({
    queryKey: ['enrollRequests', id],
    queryFn: () => clientApi<EnrollRequest[]>(`/courses/${id}/enrollments?status=PENDING`),
    enabled: isOwner,
  });

  function changeTab(next: Tab) {
    setTab(next);
    router.replace(`/courses/${id}/manage?tab=${next}`, { scroll: false });
  }

  if (isLoading || !session) {
    return (
      <div className="container">
        <Skeleton height={60} />
        <Skeleton height={360} radius="var(--radius-lg)" />
      </div>
    );
  }
  if (isError || !course) {
    return (
      <div className="container">
        <QueryError error={error} onRetry={() => refetch()} />
      </div>
    );
  }
  if (!isOwner) {
    return (
      <div className="container">
        <Forbidden text={t('forbidden')} />
      </div>
    );
  }

  return (
    <div className="container">
      <PageHeader
        eyebrow={
          <span className={ui.crumbs}>
            <Link href="/">{t('breadcrumbCourses')}</Link> / {t('breadcrumbManage')}
          </span>
        }
        title={
          <span className={styles.titleRow}>
            {course.title}
            {course.published ? (
              <Badge tone="success">{t('published')}</Badge>
            ) : (
              <Badge>{t('draft')}</Badge>
            )}
          </span>
        }
        actions={
          <>
            <LinkButton href={`/c/${course.id}`} variant="outline">
              {t('landing')}
            </LinkButton>
            {canEditContent && (
              <LinkButton href={`/teacher/courses/${course.id}/builder`} variant="outline">
                {t('builder')}
              </LinkButton>
            )}
          </>
        }
      />

      <Tabs<Tab>
        label={t('tabsAria')}
        value={tab}
        onChange={changeTab}
        items={[
          { value: 'requests', label: t('tabs.requests'), count: requests?.length },
          { value: 'students', label: t('tabs.students'), count: students?.length },
          { value: 'tests', label: t('tabs.tests') },
          { value: 'assignments', label: t('tabs.assignments') },
          { value: 'gradebook', label: t('tabs.gradebook') },
          { value: 'team', label: t('tabs.team') },
        ]}
      />

      {tab === 'requests' && <EnrollRequests courseId={id} />}
      {tab === 'students' && (
        <>
          <EnrollRequests courseId={id} variant="strip" />
          <StudentsTable courseTitle={course.title} students={students} />
        </>
      )}
      {tab === 'tests' && (
        <>
          <EssayReviews courseId={id} />
          <TestsTab courseId={id} />
        </>
      )}
      {tab === 'assignments' && <AssignmentsTab courseId={id} />}
      {tab === 'gradebook' && <GradebookTab courseId={id} />}
      {tab === 'team' && <TeamTab courseId={id} />}
    </div>
  );
}

function StudentsTable({
  courseTitle,
  students,
}: {
  courseTitle: string;
  students: StudentProgress[] | undefined;
}) {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations('manage.students');
  const errorText = useApiErrorMessage();
  const f = useFormat();
  const labels = useLabels();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<EnrollmentStatus | ''>('');
  const [details, setDetails] = useState<StudentProgress | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (students ?? []).filter(
      (s) =>
        (!status || s.status === status) &&
        (!q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)),
    );
  }, [students, query, status]);

  const message = useMutation({
    mutationFn: (userId: number) =>
      clientApi<{ id: number }>('/chat/conversations/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      }),
    onSuccess: (conv) => router.push(`/chat?c=${conv.id}`),
    onError: (e) => toast(errorText(e, t('chatFailed')), 'error'),
  });

  function exportCsv() {
    const header = [
      t('csv.student'),
      t('csv.email'),
      t('csv.status'),
      t('csv.progress'),
      t('csv.lessons'),
      t('csv.tests'),
      t('csv.avgScore'),
      t('csv.lastActivity'),
    ];
    const rows = filtered.map((s) => [
      s.name,
      s.email,
      labels.enrollment(s.status),
      String(s.percent),
      `${s.lessons.completed}/${s.lessons.total}`,
      `${s.tests.completed}/${s.tests.total}`,
      s.averageScore === null ? '' : String(s.averageScore),
      s.lastActivityAt ? new Date(s.lastActivityAt).toISOString() : '',
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = t('csv.filename', { course: courseTitle });
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!students) return <Skeleton height={320} radius="var(--radius-lg)" />;
  if (students.length === 0) {
    return (
      <div className={ui.card}>
        <EmptyState icon={<Users size={40} />} title={t('emptyTitle')}>
          <p className={ui.muted}>{t('emptyHint')}</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <section className={ui.card} aria-label={t('aria')}>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">{t('search')}</span>
          <Input
            type="search"
            placeholder={t('search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className={styles.filter}>
          <span className={styles.filterLabel}>{t('status')}</span>
          <Select value={status} onChange={(e) => setStatus(e.target.value as EnrollmentStatus | '')}>
            <option value="">{t('all')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {labels.enrollment(s)}
              </option>
            ))}
          </Select>
        </label>
        <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download size={18} aria-hidden="true" />
          {t('exportCsv')}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <NoResults
          query={query || undefined}
          onReset={() => {
            setQuery('');
            setStatus('');
          }}
        />
      ) : (
        <ScrollArea className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">{t('table.student')}</th>
                <th scope="col">{t('table.status')}</th>
                <th scope="col">{t('table.progress')}</th>
                <th scope="col">{t('table.lessons')}</th>
                <th scope="col">{t('table.avgScore')}</th>
                <th scope="col">{t('table.lastActivity')}</th>
                <th scope="col">
                  <span className="sr-only">{t('table.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.userId}>
                  <td>
                    <div className={ui.person}>
                      <Avatar src={fileUrl(s.avatarUrl)} name={s.name} size={36} />
                      <div className={ui.personText}>
                        <span className={ui.personName}>{s.name}</span>
                        <span className={ui.personSub}>{s.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[s.status]}>{labels.enrollment(s.status)}</Badge>
                  </td>
                  <td className={ui.progressCell}>
                    <Progress value={s.percent} showValue size="sm" label={t('progressOf', { name: s.name })} />
                  </td>
                  <td>
                    {s.lessons.completed}/{s.lessons.total}
                  </td>
                  <td>{s.averageScore === null ? '—' : `${s.averageScore}%`}</td>
                  <td className={styles.nowrap}>
                    {s.lastActivityAt ? f.relative(s.lastActivityAt) : '—'}
                  </td>
                  <td>
                    <div className={ui.rowActions}>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={message.isPending}
                        onClick={() => message.mutate(s.userId)}
                        aria-label={t('messageAria', { name: s.name })}
                      >
                        <MessageCircle size={16} aria-hidden="true" />
                        {t('message')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetails(s)}
                        aria-label={t('detailsAria', { name: s.name })}
                      >
                        {t('details')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      )}
      <p className={`${ui.muted} ${styles.count}`}>
        {t('shown', { shown: filtered.length, count: students.length })}
      </p>

      <Modal
        open={!!details}
        onClose={() => setDetails(null)}
        title={details?.name ?? ''}
        footer={
          <Button variant="outline" onClick={() => setDetails(null)}>
            {t('close')}
          </Button>
        }
      >
        {details && (
          <dl className={styles.details}>
            <div>
              <dt>{t('detail.email')}</dt>
              <dd>{details.email}</dd>
            </div>
            <div>
              <dt>{t('detail.status')}</dt>
              <dd>{labels.enrollment(details.status)}</dd>
            </div>
            <div>
              <dt>{t('detail.progress')}</dt>
              <dd>{details.percent}%</dd>
            </div>
            <div>
              <dt>{t('detail.lessons')}</dt>
              <dd>{t('detail.outOf', { done: details.lessons.completed, total: details.lessons.total })}</dd>
            </div>
            <div>
              <dt>{t('detail.tests')}</dt>
              <dd>{t('detail.outOf', { done: details.tests.completed, total: details.tests.total })}</dd>
            </div>
            <div>
              <dt>{t('detail.avgScore')}</dt>
              <dd>{details.averageScore === null ? '—' : `${details.averageScore}%`}</dd>
            </div>
            <div>
              <dt>{t('detail.lastActivity')}</dt>
              <dd>{details.lastActivityAt ? f.dateTime(details.lastActivityAt) : '—'}</dd>
            </div>
          </dl>
        )}
      </Modal>
    </section>
  );
}

function TestsTab({ courseId }: { courseId: number }) {
  const t = useTranslations('manage.tests');
  const f = useFormat();
  const [open, setOpen] = useState<TestSummary | null>(null);
  const { data, isLoading, isError, refetch } = useQuery<TestSummary[]>({
    queryKey: ['testsSummary', courseId],
    queryFn: () => clientApi<TestSummary[]>(`/courses/${courseId}/tests-summary`),
  });
  const { data: results, isLoading: resultsLoading } = useQuery<TestResultRow[]>({
    queryKey: ['testResults', open?.testId],
    queryFn: () => clientApi<TestResultRow[]>(`/tests/${open!.testId}/results`),
    enabled: !!open,
  });

  if (isLoading) return <Skeleton height={240} radius="var(--radius-lg)" />;
  if (isError) return <NetworkError onRetry={() => refetch()} />;
  if (!data || data.length === 0) {
    return (
      <div className={ui.card}>
        <EmptyState icon={<Users size={40} />} title={t('emptyTitle')}>
          <p className={ui.muted}>{t('emptyHint')}</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <section className={ui.card} aria-label={t('aria')}>
      <ScrollArea className={ui.tableWrap}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th scope="col">{t('table.test')}</th>
              <th scope="col">{t('table.attempts')}</th>
              <th scope="col">{t('table.students')}</th>
              <th scope="col">{t('table.passed')}</th>
              <th scope="col">{t('table.avgScore')}</th>
              <th scope="col">
                <span className="sr-only">{t('table.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((test) => (
              <tr key={test.testId}>
                <td>
                  <div className={ui.personText}>
                    <span className={ui.personName}>{test.title}</span>
                    <span className={ui.personSub}>{test.lessonTitle}</span>
                  </div>
                </td>
                <td>{test.attempts}</td>
                <td>{test.students}</td>
                <td>
                  {test.passRate === null ? (
                    '—'
                  ) : (
                    <Badge tone={test.passRate < 60 ? 'warning' : 'success'}>{test.passRate}%</Badge>
                  )}
                </td>
                <td>{test.avgScore === null ? '—' : `${test.avgScore}%`}</td>
                <td>
                  <div className={ui.rowActions}>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={test.attempts === 0}
                      onClick={() => setOpen(test)}
                    >
                      {t('results')}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? t('resultsTitle', { title: open.title }) : ''}
        footer={
          <Button variant="outline" onClick={() => setOpen(null)}>
            {t('close')}
          </Button>
        }
      >
        {resultsLoading ? (
          <Skeleton height={120} />
        ) : !results || results.length === 0 ? (
          <p className={ui.muted}>{t('noResults')}</p>
        ) : (
          <ul className={styles.results}>
            {results.map((r) => (
              <li key={r.userId} className={styles.resultRow}>
                <div className={ui.personText}>
                  <span className={ui.personName}>{r.userName || r.email}</span>
                  <span className={ui.personSub}>
                    {t('attempt', { number: r.attempt })}
                    {r.finishedAt ? ` · ${f.date(r.finishedAt)}` : ''}
                  </span>
                </div>
                <Badge tone={r.passed ? 'success' : 'warning'}>
                  {r.score ?? 0}% ·{' '}
                  {r.pendingReview ? t('pendingShort') : r.passed ? t('passedShort') : t('failedShort')}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </section>
  );
}
