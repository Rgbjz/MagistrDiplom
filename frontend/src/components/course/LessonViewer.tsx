'use client';

import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../lib/api/client';
import type { Lesson, SessionUser } from '../../lib/types';
import styles from './LessonViewer.module.scss';

declare global {
  interface Window {
    YT?: {
      Player: new (el: string, opts: unknown) => { destroy: () => void };
      PlayerState: { ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function youtubeId(url: string | null): string | null {
  if (!url || !url.includes('youtube')) return null;
  try {
    return new URL(url).searchParams.get('v');
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
  const ytId = youtubeId(lesson.videoUrl);
  const playerRef = useRef<{ destroy: () => void } | null>(null);

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

  // YouTube IFrame API + auto-complete on ENDED.
  useEffect(() => {
    if (!ytId || !isStudent) return;

    const initPlayer = () => {
      if (!window.YT) return;
      playerRef.current = new window.YT.Player('yt-player', {
        videoId: ytId,
        events: {
          onStateChange: (e: { data: number }) => {
            if (e.data === window.YT!.PlayerState.ENDED) {
              completeMutation.mutate();
            }
          },
        },
      });
    };

    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      window.onYouTubeIframeAPIReady = initPlayer;
      document.body.appendChild(tag);
    } else {
      initPlayer();
    }

    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytId, lesson.id]);

  return (
    <div className={styles.lesson}>
      <h2 className={styles.title}>{lesson.title}</h2>

      {ytId ? (
        <div className={styles.videoWrapper}>
          <div id="yt-player" />
        </div>
      ) : lesson.videoUrl ? (
        <div className={styles.videoWrapper}>
          <iframe
            src={lesson.videoUrl}
            title={lesson.title}
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
