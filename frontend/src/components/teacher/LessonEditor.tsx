'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../lib/api/client';
import type { Lesson } from '../../lib/types';
import styles from './LessonEditor.module.scss';

function toEmbedUrl(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (url.includes('youtube.com/watch')) {
      const id = u.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }
    if (url.includes('youtu.be/')) {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }
    if (url.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : '';
    }
  } catch {
    return '';
  }
  return '';
}

export function LessonEditor({
  lesson,
  courseId,
}: {
  lesson: Lesson;
  courseId: number;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(lesson.title);
  const [content, setContent] = useState(lesson.content ?? '');
  const [videoUrl, setVideoUrl] = useState(lesson.videoUrl ?? '');

  useEffect(() => {
    setTitle(lesson.title);
    setContent(lesson.content ?? '');
    setVideoUrl(lesson.videoUrl ?? '');
  }, [lesson.id, lesson.title, lesson.content, lesson.videoUrl]);

  const embed = useMemo(() => toEmbedUrl(videoUrl), [videoUrl]);

  const save = useMutation({
    mutationFn: () =>
      clientApi(`/lessons/${lesson.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, videoUrl }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['course', courseId] }),
  });

  return (
    <div className={styles.editor}>
      <div className={styles.header}>
        <input
          className={styles.title}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          className={styles.saveBtn}
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          {save.isPending ? 'Saving…' : '💾 Save'}
        </button>
      </div>

      <div className={styles.videoBlock}>
        <label>Video URL (YouTube / Vimeo)</label>
        <input
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
        />
        {embed && (
          <div className={styles.video}>
            <iframe src={embed} title="preview" allowFullScreen />
          </div>
        )}
      </div>

      <div className={styles.content}>
        <label>Content (HTML)</label>
        <textarea
          rows={12}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
    </div>
  );
}
