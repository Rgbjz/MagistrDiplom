'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ChevronRight, FileUp, Paperclip, Star, Upload, X } from 'lucide-react';
import { clientApi } from '../../lib/api/client';
import { uploadWithProgress } from '../../lib/api/upload';
import { useLocale, useTranslations } from 'next-intl';
import { useApiErrorMessage, useDeadline, useFormat } from '../../i18n/format';
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_BYTES, formatFileSize } from '../../lib/files';
import { sanitizeHtml } from '../../lib/sanitize';
import type {
  ActiveItem,
  AssignmentDetail,
  CourseDetail,
  SessionUser,
  Submission,
  SubmissionWithStudent,
} from '../../lib/types';
import { Badge, Button, Field, Progress, Skeleton, Textarea, useToast } from '../ui';
import { FileList } from './FileList';
import type { CourseItem } from './courseItems';
import styles from './AssignmentViewer.module.scss';

const ACCEPTED = new Set(ATTACHMENT_ACCEPT.split(','));

export function SubmissionStatusBadge({ submission, maxScore }: { submission: Submission; maxScore: number }) {
  const t = useTranslations('assignment.status');
  return (
    <span className={styles.badges}>
      {submission.status === 'GRADED' ? (
        <Badge tone="success">{t('graded', { score: submission.score ?? 0, max: maxScore })}</Badge>
      ) : submission.status === 'RETURNED' ? (
        <Badge tone="warning">{t('returned')}</Badge>
      ) : (
        <Badge tone="primary">{t('submitted')}</Badge>
      )}
      {submission.late && <Badge tone="danger">{t('late')}</Badge>}
    </span>
  );
}

export function AssignmentViewer({
  assignmentId,
  course,
  user,
  next,
  onNavigate,
}: {
  assignmentId: number;
  course: CourseDetail;
  user: SessionUser;
  next: CourseItem | null;
  onNavigate: (item: ActiveItem) => void;
}) {
  const t = useTranslations('assignment.viewer');
  const f = useFormat();
  const deadlineOf = useDeadline();
  const { data: assignment, isLoading, isError } = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: () => clientApi<AssignmentDetail>(`/assignments/${assignmentId}`),
  });

  if (isLoading) return <Skeleton height={360} radius="var(--radius-lg)" />;
  if (isError || !assignment) {
    return <p className={styles.muted}>{t('loadError')}</p>;
  }

  const deadline = deadlineOf(assignment.dueAt);
  const isStudent = user.role === 'STUDENT';

  return (
    <article className={styles.card}>
      <header className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          <FileUp size={26} />
        </span>
        <div className={styles.headText}>
          <span className={styles.eyebrow}>{t('eyebrow', { lesson: assignment.lessonTitle })}</span>
          <h1 className={styles.title}>{assignment.title}</h1>
        </div>
      </header>

      <dl className={styles.meta}>
        <div className={styles.metaBox}>
          <CalendarClock size={16} aria-hidden="true" />
          <dt className="sr-only">{t('dueTerm')}</dt>
          <dd>
            {assignment.dueAt ? t('dueAt', { date: f.dateTime(assignment.dueAt) }) : t('noDue')}
            {deadline && (
              <span className={deadline.overdue ? styles.overdue : styles.left}> · {deadline.text}</span>
            )}
          </dd>
        </div>
        <div className={styles.metaBox}>
          <Star size={16} aria-hidden="true" />
          <dt className="sr-only">{t('maxScoreTerm')}</dt>
          <dd>{t('maxScore', { count: assignment.maxScore })}</dd>
        </div>
        <div className={styles.metaBox}>
          <Paperclip size={16} aria-hidden="true" />
          <dt className="sr-only">{t('filesTerm')}</dt>
          <dd>{t('maxFiles', { count: assignment.maxFiles })}</dd>
        </div>
      </dl>

      {assignment.description && (
        <div
          className={styles.description}
          // Teacher-authored HTML, sanitized before rendering.
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(assignment.description) }}
        />
      )}

      {isStudent ? (
        <StudentPanel assignment={assignment} courseId={course.id} />
      ) : (
        <TeacherPanel assignment={assignment} />
      )}

      {next && (
        <footer className={styles.nav}>
          <Button variant="outline" onClick={() => onNavigate({ type: next.type, id: next.id })}>
            {t('next')}
            <ChevronRight size={18} aria-hidden="true" />
          </Button>
        </footer>
      )}
    </article>
  );
}

function StudentPanel({ assignment, courseId }: { assignment: AssignmentDetail; courseId: number }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const t = useTranslations('assignment.student');
  const f = useFormat();
  const locale = useLocale();
  const errorText = useApiErrorMessage();
  const maxSize = formatFileSize(ATTACHMENT_MAX_BYTES, locale);
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [comment, setComment] = useState(assignment.submission?.comment ?? '');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const submission = assignment.submission;
  const locked = submission?.status === 'GRADED';

  function addFiles(list: FileList | null) {
    if (!list) return;
    const accepted: File[] = [];
    for (const file of Array.from(list)) {
      const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
      if (!ACCEPTED.has(ext)) {
        toast(t('unsupported', { name: file.name }), 'error');
      } else if (file.size > ATTACHMENT_MAX_BYTES) {
        toast(t('tooLarge', { name: file.name, size: maxSize }), 'error');
      } else {
        accepted.push(file);
      }
    }
    setFiles((prev) => {
      const merged = [...prev, ...accepted];
      if (merged.length > assignment.maxFiles) {
        toast(t('tooMany', { count: assignment.maxFiles }), 'error');
        return merged.slice(0, assignment.maxFiles);
      }
      return merged;
    });
  }

  async function submit() {
    if (files.length === 0) {
      toast(t('atLeastOne'), 'error');
      return;
    }
    const form = new FormData();
    for (const file of files) form.append('files', file);
    if (comment.trim()) form.append('comment', comment.trim());
    setProgress(0);
    try {
      await uploadWithProgress<Submission>(`/assignments/${assignment.id}/submission`, form, setProgress);
      setFiles([]);
      toast(submission ? t('resubmitted') : t('submittedToast'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['assignment', assignment.id] }),
        queryClient.invalidateQueries({ queryKey: ['course', courseId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    } catch (e) {
      toast(errorText(e, t('submitError')), 'error');
    } finally {
      setProgress(null);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="submission-title">
      <div className={styles.panelHead}>
        <h2 id="submission-title" className={styles.subTitle}>
          {t('title')}
        </h2>
        {submission && <SubmissionStatusBadge submission={submission} maxScore={assignment.maxScore} />}
      </div>

      {submission && (
        <div className={styles.submitted}>
          <p className={styles.muted}>{t('submittedAt', { date: f.dateTime(submission.submittedAt) })}</p>
          <FileList files={submission.files.map((file) => ({ ...file, lessonId: 0 }))} />
          {submission.comment && <p className={styles.comment}>«{submission.comment}»</p>}
          {submission.feedback && submission.status !== 'SUBMITTED' && (
            <div
              className={`${styles.feedback} ${submission.status === 'RETURNED' ? styles.feedbackWarn : ''}`}
              role="note"
            >
              <span className={styles.feedbackLabel}>{t('teacherComment')}</span>
              <p>{submission.feedback}</p>
            </div>
          )}
        </div>
      )}

      {locked ? (
        <p className={styles.muted}>{t('locked')}</p>
      ) : (
        <>
          <label
            className={`${styles.drop} ${dragging ? styles.dragging : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            <Upload size={22} aria-hidden="true" />
            <span>
              {t.rich('drop', { strong: (c) => <strong>{c}</strong> })}
              <span className={styles.dropHint}>
                {t('dropHint', { count: assignment.maxFiles, size: maxSize })}
              </span>
            </span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="sr-only"
              aria-label={t('filesInput')}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>

          {files.length > 0 && (
            <ul className={styles.selected} aria-label={t('selected')}>
              {files.map((file, i) => (
                <li key={`${file.name}-${i}`} className={styles.selectedItem}>
                  <span className={styles.selectedName}>{file.name}</span>
                  <span className={styles.muted}>{formatFileSize(file.size, locale)}</span>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    aria-label={t('remove', { name: file.name })}
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    disabled={progress !== null}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Field label={t('comment')} hint={t('optional')}>
            <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={5000} />
          </Field>

          {progress !== null && <Progress value={progress} label={t('uploading')} showValue />}

          <div>
            <Button onClick={submit} loading={progress !== null} disabled={files.length === 0}>
              <FileUp size={18} aria-hidden="true" />
              {submission ? t('resubmit') : t('submit')}
            </Button>
            {submission?.status === 'SUBMITTED' && (
              <p className={styles.hint}>{t('replaceHint')}</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function TeacherPanel({ assignment }: { assignment: AssignmentDetail }) {
  const t = useTranslations('assignment.teacher');
  const { data } = useQuery({
    queryKey: ['assignment-submissions', assignment.id],
    queryFn: () => clientApi<SubmissionWithStudent[]>(`/assignments/${assignment.id}/submissions`),
  });
  const pending = data?.filter((s) => s.status === 'SUBMITTED').length ?? 0;
  return (
    <section className={styles.panel} aria-label={t('label')}>
      <p>
        {t.rich('summary', {
          total: data?.length ?? '…',
          pending,
          strong: (c) => <strong>{c}</strong>,
        })}
      </p>
      <Link href={`/courses/${assignment.courseId}/manage?tab=assignments`} className={styles.linkBtn}>
        {t('review')}
      </Link>
    </section>
  );
}
