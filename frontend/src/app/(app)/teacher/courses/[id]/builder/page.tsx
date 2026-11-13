'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Eye } from 'lucide-react';
import type { QuestionProblem } from '../../../../../../lib/questionProblem';
import { clientApi } from '../../../../../../lib/api/client';
import { useTranslations } from 'next-intl';
import { displayName, fileUrl } from '../../../../../../lib/format';
import { useApiErrorMessage } from '../../../../../../i18n/format';
import type { ActiveItem, CourseDetail, Me } from '../../../../../../lib/types';
import { TeacherGuard } from '../../../../../../components/teacher/TeacherGuard';
import { BuilderStructurePanel } from '../../../../../../components/teacher/BuilderStructurePanel';
import { BuilderEditorPanel } from '../../../../../../components/teacher/BuilderEditorPanel';
import { QuestionBank } from '../../../../../../components/teacher/QuestionBank';
import {
  BasicFields,
  CardPreview,
  CoverPriceFields,
} from '../../../../../../components/teacher/course-form/CourseFields';
import {
  formFromCourse,
  toFormData,
  validateCourse,
  type CourseFormState,
} from '../../../../../../components/teacher/course-form/courseForm';
import {
  Badge,
  Button,
  PageHeader,
  Skeleton,
  Tabs,
  useToast,
} from '../../../../../../components/ui';
import { Forbidden, QueryError } from '../../../../../../components/states';
import { LinkButton } from '../../../../../../components/states/LinkButton';
import {
  GradingFields,
  gradingFromCourse,
  gradingPayload,
  validateGrading,
  type GradingState,
} from '../../../../../../components/teacher/course-form/GradingFields';
import styles from './builder.module.scss';
import { canCourse } from '../../../../../../lib/courseRole';

type Tab = 'structure' | 'bank' | 'settings';

interface PublishProblem {
  testId: number;
  lessonId: number;
  lessonTitle: string;
  questionId: number;
  index: number;
  problem: QuestionProblem;
}

/** The 400 the backend sends when a test has unanswerable questions. */
function incompleteQuestions(e: unknown): PublishProblem[] | null {
  const m = e instanceof Error ? /^API 400 [^:]+: ([\s\S]*)$/.exec(e.message) : null;
  if (!m) return null;
  try {
    const body = JSON.parse(m[1]) as { code?: string; errors?: PublishProblem[] };
    return body.code === 'INCOMPLETE_QUESTIONS' && body.errors?.length ? body.errors : null;
  } catch {
    return null;
  }
}

/** Machine-readable reason of a 400 from the API (e.g. EMPTY_COURSE). */
function apiErrorCode(e: unknown): string | null {
  const m = e instanceof Error ? /^API 400 [^:]+: ([\s\S]*)$/.exec(e.message) : null;
  if (!m) return null;
  try {
    return (JSON.parse(m[1]) as { code?: string }).code ?? null;
  } catch {
    return null;
  }
}

function Builder() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const toast = useToast();
  const t = useTranslations('builder.page');
  const tq = useTranslations('builder.test');
  const errorText = useApiErrorMessage();
  const [tab, setTab] = useState<Tab>('structure');
  // Deep links: …/builder?tab=settings (gradebook), …/builder?tab=bank
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('tab');
    if (q === 'settings' || q === 'bank') setTab(q);
  }, []);
  const [active, setActive] = useState<ActiveItem>(null);
  const [publishProblems, setPublishProblems] = useState<PublishProblem[] | null>(null);

  const { data: course, isLoading, isError, error, refetch } = useQuery<CourseDetail>({
    queryKey: ['course', id],
    queryFn: () => clientApi<CourseDetail>(`/courses/${id}`),
  });

  const publish = useMutation({
    mutationFn: (published: boolean) => {
      const fd = new FormData();
      fd.append('published', String(published));
      return clientApi(`/courses/${id}`, { method: 'PATCH', body: fd });
    },
    onMutate: () => setPublishProblems(null),
    onSuccess: (_d, published) => {
      toast(published ? t('published') : t('unpublished'));
      queryClient.invalidateQueries({ queryKey: ['course', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => {
      const problems = incompleteQuestions(e);
      if (problems) setPublishProblems(problems);
      else if (apiErrorCode(e) === 'EMPTY_COURSE') toast(t('publishEmpty'), 'error');
      else toast(errorText(e), 'error');
    },
  });

  if (isLoading) {
    return (
      <div className="container">
        <Skeleton height={60} />
        <Skeleton height={420} radius="var(--radius-lg)" />
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
  // Owners and teachers on the course team edit content; assistants manage only.
  if (!canCourse(course.myRole, 'content')) {
    return (
      <div className="container">
        <Forbidden text={t('forbidden')} />
      </div>
    );
  }

  const published = course.published ?? false;

  return (
    <div className="container">
      <PageHeader
        eyebrow={
          <span>
            <Link href="/">{t('breadcrumbCourses')}</Link> / {t('breadcrumbBuilder')}
          </span>
        }
        title={course.title}
        actions={
          <>
            {published ? <Badge tone="success">{t('statusPublished')}</Badge> : <Badge>{t('statusDraft')}</Badge>}
            <span className={styles.saved}>
              <Check size={16} aria-hidden="true" />
              {t('autosave')}
            </span>
            <LinkButton href={`/c/${course.id}`} variant="outline" target="_blank">
              <Eye size={18} aria-hidden="true" />
              {t('viewLanding')}
            </LinkButton>
            <Button
              variant={published ? 'outline' : 'primary'}
              loading={publish.isPending}
              onClick={() => publish.mutate(!published)}
            >
              {published ? t('unpublish') : t('publish')}
            </Button>
          </>
        }
      />

      {publishProblems && (
        <div className={styles.publishProblems} role="alert">
          <p className={styles.publishProblemsTitle}>
            <AlertTriangle size={18} aria-hidden="true" />
            {t('publishBlocked', { count: publishProblems.length })}
          </p>
          <ul>
            {publishProblems.map((p) => (
              <li key={p.questionId}>
                <button
                  type="button"
                  className={styles.problemLink}
                  onClick={() => {
                    setTab('structure');
                    setActive({ type: 'TEST', id: p.testId });
                  }}
                >
                  {t('publishProblem', { test: p.lessonTitle, index: p.index })}
                </button>
                {' — '}
                {tq(`problems.${p.problem}`)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.tabsRow}>
        <Tabs<Tab>
          label={t('tabsAria')}
          value={tab}
          onChange={setTab}
          items={[
            { value: 'structure', label: t('tabStructure') },
            { value: 'bank', label: t('tabBank') },
            { value: 'settings', label: t('tabSettings') },
          ]}
        />
        <div className={styles.tabLinks}>
          <Link href={`/courses/${course.id}/manage?tab=requests`}>{t('linkRequests')}</Link>
          <Link href={`/courses/${course.id}/manage?tab=students`}>{t('linkProgress')}</Link>
        </div>
      </div>

      {tab === 'structure' ? (
        <div className={styles.builder}>
          <BuilderStructurePanel course={course} active={active} onSelect={setActive} />
          <div className={styles.right}>
            <BuilderEditorPanel
              active={active}
              course={course}
              onTestDeleted={() => setActive(null)}
            />
          </div>
        </div>
      ) : tab === 'bank' ? (
        <QuestionBank courseId={course.id} />
      ) : (
        <CourseSettings course={course} />
      )}
    </div>
  );
}

function CourseSettings({ course }: { course: CourseDetail }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const t = useTranslations('builder.settings');
  const errorText = useApiErrorMessage();
  const { data: session } = useSession();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => clientApi<Me>('/users/me'),
  });
  const [form, setForm] = useState<CourseFormState>(() =>
    formFromCourse(course, fileUrl(course.imageUrl)),
  );
  const [showErrors, setShowErrors] = useState(false);
  const errors = validateCourse(form);
  const [grading, setGrading] = useState<GradingState>(() => gradingFromCourse(course));
  const gradingError = validateGrading(grading);

  useEffect(() => {
    setForm(formFromCourse(course, fileUrl(course.imageUrl)));
    setGrading(gradingFromCourse(course));
  }, [course]);

  const save = useMutation({
    mutationFn: () =>
      clientApi(`/courses/${course.id}`, {
        method: 'PATCH',
        body: toFormData(form, gradingPayload(grading)),
      }),
    onSuccess: () => {
      toast(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['course', course.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['gradebook', course.id] });
    },
    onError: (e) => toast(errorText(e, t('saveFailed')), 'error'),
  });

  return (
    <div className={styles.settings}>
      <form
        className={styles.settingsCard}
        onSubmit={(e) => {
          e.preventDefault();
          if (Object.keys(errors).length || gradingError) {
            setShowErrors(true);
            return;
          }
          save.mutate();
        }}
      >
        <h2 className={styles.settingsTitle}>{t('basic')}</h2>
        <BasicFields form={form} setForm={setForm} errors={showErrors ? errors : {}} />
        <h2 className={styles.settingsTitle}>{t('coverPrice')}</h2>
        <CoverPriceFields
          form={form}
          setForm={setForm}
          errors={showErrors ? errors : {}}
          priceLocked={!canCourse(course.myRole, 'owner')}
        />
        <h2 className={styles.settingsTitle}>{t('grading')}</h2>
        <GradingFields
          value={grading}
          onChange={setGrading}
          error={showErrors ? gradingError : null}
          courseId={course.id}
        />
        <div className={styles.settingsFooter}>
          <Button type="submit" loading={save.isPending}>
            {t('save')}
          </Button>
        </div>
      </form>
      <aside className={styles.settingsPreview}>
        <CardPreview
          form={form}
          teacherName={displayName(me?.profile, session?.user?.email ?? '')}
          sectionsCount={course.sections.length}
        />
      </aside>
    </div>
  );
}

export default function CourseBuilderPage() {
  return (
    <TeacherGuard>
      <Builder />
    </TeacherGuard>
  );
}
