'use client';

import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { clientApi } from '../../lib/api/client';
import { useTranslations } from 'next-intl';
import { useApiErrorMessage, useTestLabels } from '../../i18n/format';
import type { ActiveItem, CourseDetail, SessionUser } from '../../lib/types';
import { Button, useToast } from '../ui';
import { isDone, type CourseItem } from './courseItems';
import styles from './LessonViewer.module.scss';
import { sanitizeHtml } from '../../lib/sanitize';
import { isVideoFile, videoSrc } from '../../lib/files';
import { FileList } from './FileList';
import { VideoPlayer } from '../video/VideoPlayer';

// Convert a YouTube/Vimeo URL into an embeddable iframe src.
// Plain `<iframe>` of a youtube.com/watch (or youtu.be) URL is refused by
// YouTube (X-Frame-Options) — only the /embed/ form can be framed.
function toEmbedUrl(url: string | null): string | null {
  if (!url || isVideoFile(url)) return null;
  try {
    const u = new URL(url);
    if (url.includes('youtube.com/watch')) {
      const id = u.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.includes('youtu.be/')) {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.includes('youtube.com/embed/')) return url;
    if (url.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    return url;
  } catch {
    return null;
  }
}

export function LessonViewer({
  item,
  course,
  user,
  prev,
  next,
  onNavigate,
}: {
  item: CourseItem;
  course: CourseDetail;
  user: SessionUser;
  prev: CourseItem | null;
  next: CourseItem | null;
  onNavigate: (item: ActiveItem) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const lesson = item.lesson;
  const t = useTranslations('course.lesson');
  const errorText = useApiErrorMessage();
  const tests = useTestLabels();
  const isStudent = user.role === 'STUDENT';
  const done = isDone(course, item);
  // An uploaded (HLS) video takes precedence over a YouTube/Vimeo link.
  const uploaded = lesson.video ?? null;
  const embed = uploaded ? null : toEmbedUrl(lesson.videoUrl);
  const videoFile =
    !uploaded && isVideoFile(lesson.videoUrl) ? videoSrc(lesson.videoUrl as string) : null;
  const files = lesson.files ?? [];

  const startMutation = useMutation({
    mutationFn: () =>
      clientApi(`/courseProgress/lessons/${lesson.id}/start`, { method: 'POST' }),
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      clientApi(`/courseProgress/lessons/${lesson.id}/complete`, { method: 'POST' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['course', course.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['my-courses'] });
      goNext();
    },
    onError: (e) => toast(errorText(e, t('saveError')), 'error'),
  });

  // Start the lesson once when a student opens it.
  useEffect(() => {
    if (isStudent && !done) startMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  function goNext() {
    if (next) onNavigate({ type: next.type, id: next.id });
    else if (isStudent) toast(t('allDone'));
  }

  return (
    <article className={styles.lesson}>
      {embed && (
        <div className={styles.video}>
          <iframe
            src={embed}
            title={t('video', { title: lesson.title })}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
      {uploaded && <VideoPlayer key={uploaded.id} video={uploaded} title={lesson.title} />}
      {videoFile && (
        <div className={styles.video}>
          <video src={videoFile} controls preload="metadata" playsInline>
            <a href={videoFile}>{t('downloadVideo')}</a>
          </video>
        </div>
      )}

      <header className={styles.head}>
        <span className={styles.eyebrow}>
          {t('position', {
            section: item.sectionIndex + 1,
            lesson: item.lessonIndex + 1,
            total: item.sectionLessons,
          })}
        </span>
        <h1 className={styles.title}>{lesson.title}</h1>
      </header>

      {lesson.content ? (
        <div
          className={styles.content}
          // Teacher-authored HTML, sanitized before rendering.
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(lesson.content) }}
        />
      ) : (
        !embed &&
        !videoFile &&
        !uploaded &&
        files.length === 0 && <p className={styles.muted}>{t('empty')}</p>
      )}

      {files.length > 0 && (
        <section className={styles.files} aria-labelledby={`lesson-files-${lesson.id}`}>
          <h2 id={`lesson-files-${lesson.id}`} className={styles.filesTitle}>
            {t('materials')}
          </h2>
          <FileList files={files} />
        </section>
      )}

      <footer className={styles.nav}>
        {prev ? (
          <Button
            variant="outline"
            // The label is hidden on phones, leaving only the arrow.
            aria-label={t('prevAria', {
              title: prev.type === 'TEST' ? tests.short(prev.title) : prev.title,
            })}
            onClick={() => onNavigate({ type: prev.type, id: prev.id })}
          >
            <ChevronLeft size={18} aria-hidden="true" />
            <span className={styles.navLabel}>{prev.type === 'TEST' ? tests.short(prev.title) : prev.title}</span>
          </Button>
        ) : (
          <span />
        )}
        {isStudent && !done ? (
          <Button loading={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
            <Check size={18} aria-hidden="true" />
            {next ? t('completeNext') : t('complete')}
          </Button>
        ) : (
          next && (
            <Button onClick={goNext}>
              {t('next')}
              <ChevronRight size={18} aria-hidden="true" />
            </Button>
          )
        )}
      </footer>
    </article>
  );
}
