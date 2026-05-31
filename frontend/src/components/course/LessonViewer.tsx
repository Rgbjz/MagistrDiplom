'use client';

import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../lib/api/client';
import type { Lesson, SessionUser } from '../../lib/types';
import styles from './LessonViewer.module.scss';

// Convert a YouTube/Vimeo URL into an embeddable iframe src.
// Plain `<iframe>` of a youtube.com/watch (or youtu.be) URL is refused by
// YouTube (X-Frame-Options) — only the /embed/ form can be framed.
function toEmbedUrl(url: string | null): string | null {
  if (!url) return null;
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
  lesson,
  courseId,
  user,
}: {
  lesson: Lesson;
  courseId: number;
  user: SessionUser;
}) {
  const queryClient = useQueryClient();
  const isStudent = user.role === 'STUDENT';
  const embed = toEmbedUrl(lesson.videoUrl);

  const startMutation = useMutation({
    mutationFn: () =>
      clientApi(`/courseProgress/lessons/${lesson.id}/start`, {
        method: 'POST',
      }),
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      clientApi(`/courseProgress/lessons/${lesson.id}/complete`, {
        method: 'POST',
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['course', courseId] }),
  });

  // Start the lesson once when a student opens it.
  useEffect(() => {
    if (isStudent) startMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  return (
    <div className={styles.lesson}>
      <h2 className={styles.title}>{lesson.title}</h2>

      {embed ? (
        <div className={styles.videoWrapper}>
          <iframe
            src={embed}
            title={lesson.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : null}

      <div
        className={styles.content}
        dangerouslySetInnerHTML={{ __html: lesson.content ?? '' }}
      />

      {isStudent && (
        <button
          className={styles.completeBtn}
          onClick={() => completeMutation.mutate()}
          disabled={completeMutation.isPending}
        >
          {completeMutation.isPending ? 'Saving…' : 'Mark as complete'}
        </button>
      )}
    </div>
  );
}
