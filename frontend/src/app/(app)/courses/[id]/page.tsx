'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ChevronUp, Lock, X } from 'lucide-react';
import { clientApi } from '../../../../lib/api/client';
import type {
  ActiveItem,
  CourseDetail,
  SessionUser,
  TestFull,
  TestStartResponse,
} from '../../../../lib/types';
import { Button, EmptyState, Skeleton } from '../../../../components/ui';
import { CourseTopBar } from '../../../../components/course/CourseTopBar';
import { StructurePanel } from '../../../../components/course/StructurePanel';
import { LessonViewer } from '../../../../components/course/LessonViewer';
import { TestViewer } from '../../../../components/course/TestViewer';
import { TestRunner } from '../../../../components/course/TestRunner';
import { AssignmentViewer } from '../../../../components/course/AssignmentViewer';
import { firstPending, flattenCourse, sameItem } from '../../../../components/course/courseItems';
import styles from './course.module.scss';

export default function CoursePage() {
  return (
    <Suspense fallback={<CourseSkeleton />}>
      <CourseView />
    </Suspense>
  );
}

function CourseSkeleton() {
  return (
    <div className={styles.layout}>
      <Skeleton height={420} radius="var(--radius-lg)" />
    </div>
  );
}

function CourseView() {
  const t = useTranslations('course.page');
  const tStructure = useTranslations('course.structure');
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { data: session } = useSession();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [running, setRunning] = useState<{ session: TestStartResponse; test: TestFull } | null>(null);

  const { data: course, isLoading, isError, error } = useQuery<CourseDetail>({
    queryKey: ['course', id],
    queryFn: () => clientApi<CourseDetail>(`/courses/${id}`),
  });

  const items = useMemo(() => (course ? flattenCourse(course) : []), [course]);

  const lessonParam = Number(search.get('lesson'));
  const testParam = Number(search.get('test'));
  const assignmentParam = Number(search.get('assignment'));
  const requested: ActiveItem = lessonParam
    ? { type: 'LESSON', id: lessonParam }
    : testParam
      ? { type: 'TEST', id: testParam }
      : assignmentParam
        ? { type: 'ASSIGNMENT', id: assignmentParam }
        : null;
  const active: ActiveItem =
    requested && items.some((i) => sameItem(requested, i))
      ? requested
      : course
        ? firstPending(course)
        : null;

  const index = items.findIndex((i) => sameItem(active, i));
  const current = index >= 0 ? items[index] : null;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [active?.type, active?.id]);

  if (!session) return null;
  const user = session.user as SessionUser;

  function select(item: ActiveItem) {
    setSheetOpen(false);
    if (!item) return;
    const key =
      item.type === 'LESSON' ? 'lesson' : item.type === 'ASSIGNMENT' ? 'assignment' : 'test';
    router.replace(`${pathname}?${key}=${item.id}`, { scroll: false });
  }

  if (isLoading) return <CourseSkeleton />;

  if (isError || !course) {
    const forbidden = String((error as Error | null)?.message).includes('403');
    return (
      <div className="container">
        <EmptyState
          icon={<Lock size={28} aria-hidden="true" />}
          title={forbidden ? t('notEnrolled') : t('loadError')}
        >
          <p className={styles.muted}>
            {forbidden
              ? t('notEnrolledHint')
              : t('loadErrorHint')}
          </p>
          <Link href={forbidden ? `/c/${id}` : '/my-courses'} className={styles.linkBtn}>
            {forbidden ? t('coursePage') : t('toMyCourses')}
          </Link>
        </EmptyState>
      </div>
    );
  }

  if (running) {
    return (
      <TestRunner
        session={running.session}
        testId={running.test.id}
        testTitle={running.test.title}
        courseId={course.id}
        courseTitle={course.title}
        passingScore={running.test.passingScore}
        onExit={() => setRunning(null)}
      />
    );
  }

  const prev = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;

  const structure = (
    <StructurePanel course={course} user={user} active={active} onSelect={select} />
  );

  return (
    <>
      <CourseTopBar course={course} user={user} />
      <div className={styles.layout}>
        <div className={styles.side}>{structure}</div>

        <div className={styles.content}>
          {!current ? (
            <EmptyState title={t('noLessons')}>
              <p className={styles.muted}>{t('noLessonsHint')}</p>
            </EmptyState>
          ) : current.type === 'LESSON' ? (
            <LessonViewer
              key={`l-${current.id}`}
              item={current}
              course={course}
              user={user}
              prev={prev}
              next={next}
              onNavigate={select}
            />
          ) : current.type === 'ASSIGNMENT' ? (
            <AssignmentViewer
              key={`a-${current.id}`}
              assignmentId={current.id}
              course={course}
              user={user}
              next={next}
              onNavigate={select}
            />
          ) : (
            <TestViewer
              key={`t-${current.id}`}
              testId={current.id}
              courseId={course.id}
              user={user}
              onStarted={(s, test) => setRunning({ session: s, test })}
            />
          )}
        </div>
      </div>

      {/* Mobile: course contents as a bottom sheet */}
      <div className={styles.sheetBar}>
        <button
          type="button"
          className={styles.sheetToggle}
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(true)}
        >
          <span className={styles.sheetText}>
            <span className={styles.sheetTitle}>{tStructure('title')}</span>
            {next && <span className={styles.sheetNext}>{t('nextItem', { title: next.title })}</span>}
          </span>
          <ChevronUp size={22} aria-hidden="true" />
        </button>
      </div>
      {sheetOpen && (
        <div className={styles.sheetBackdrop} onClick={() => setSheetOpen(false)}>
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label={tStructure('title')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetHead}>
              <span className={styles.handle} aria-hidden="true" />
              <Button variant="ghost" size="sm" aria-label={t('closeContents')} onClick={() => setSheetOpen(false)}>
                <X size={20} aria-hidden="true" />
              </Button>
            </div>
            {structure}
          </div>
        </div>
      )}
    </>
  );
}
