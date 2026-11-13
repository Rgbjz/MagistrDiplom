'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Film } from 'lucide-react';
import { clientApi } from '../../lib/api/client';
import { useTranslations } from 'next-intl';
import { useApiErrorMessage } from '../../i18n/format';
import type { Lesson } from '../../lib/types';
import { Button, Field, Input, Segmented, Textarea, useToast } from '../ui';
import { VideoUploader } from '../video/VideoUploader';
import { LessonFilesEditor } from './LessonFilesEditor';
import styles from './LessonEditor.module.scss';

type VideoMode = 'link' | 'file';

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
  const toast = useToast();
  const t = useTranslations('builder.lesson');
  const errorText = useApiErrorMessage();
  const [title, setTitle] = useState(lesson.title);
  const [content, setContent] = useState(lesson.content ?? '');
  const [videoUrl, setVideoUrl] = useState(lesson.videoUrl ?? '');
  const [videoMode, setVideoMode] = useState<VideoMode>(lesson.video ? 'file' : 'link');

  useEffect(() => {
    setTitle(lesson.title);
    setContent(lesson.content ?? '');
    setVideoUrl(lesson.videoUrl ?? '');
  }, [lesson.id, lesson.title, lesson.content, lesson.videoUrl]);

  const hasUpload = Boolean(lesson.video);
  // The editor is reused when you switch lessons: follow each lesson's own
  // video (uploaded file → «Свій файл», otherwise the link tab).
  useEffect(() => {
    setVideoMode(hasUpload ? 'file' : 'link');
  }, [lesson.id, hasUpload]);

  const embed = useMemo(() => toEmbedUrl(videoUrl), [videoUrl]);
  const dirty =
    title !== lesson.title ||
    content !== (lesson.content ?? '') ||
    (videoMode === 'link' && !hasUpload && videoUrl !== (lesson.videoUrl ?? ''));

  const save = useMutation({
    mutationFn: () =>
      clientApi(`/lessons/${lesson.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // An uploaded video is managed by its own buttons, not this form.
        body: JSON.stringify(
          videoMode === 'link' && !hasUpload ? { title, content, videoUrl } : { title, content },
        ),
      }),
    onSuccess: () => {
      toast(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['course', courseId] });
    },
    onError: (e) => toast(errorText(e, t('saveFailed')), 'error'),
  });

  return (
    <div className={`${styles.card} ${styles.editor}`}>
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) save.mutate();
      }}
    >
      <div className={styles.header}>
        <span className={styles.kicker}>{t('kicker')}</span>
        <span className={styles.status}>{dirty ? t('unsaved') : t('allSaved')}</span>
      </div>

      <Field label={t('title')}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>

      <div className={styles.videoBlock}>
        <div className={styles.videoHead}>
          <span className={styles.videoTitle}>
            <Film size={16} aria-hidden="true" /> {t('video')}
          </span>
          <Segmented
            label={t('videoSource')}
            value={videoMode}
            onChange={setVideoMode}
            items={[
              { value: 'link', label: t('videoLink') },
              { value: 'file', label: t('videoFile') },
            ]}
          />
        </div>

        {videoMode === 'link' ? (
          <>
            {hasUpload ? (
              <p className={styles.hint}>{t('uploadedVideoHint')}</p>
            ) : (
              <>
                <Field label={t('videoUrl')} hint={t('videoUrlHint')}>
                  <Input
                    type="url"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=…"
                  />
                </Field>
                {embed && (
                  <div className={styles.video}>
                    <iframe src={embed} title={t('videoFrameTitle', { title })} allowFullScreen />
                  </div>
                )}
                {videoUrl && !embed && (
                  <p className={styles.warn} role="alert">
                    {t('videoUrlInvalid')}
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          <VideoUploader
            key={lesson.id}
            lessonId={lesson.id}
            courseId={courseId}
            title={title}
            video={lesson.video ?? null}
          />
        )}
      </div>

      <Field label={t('content')} hint={t('contentHint')}>
        <Textarea rows={14} value={content} onChange={(e) => setContent(e.target.value)} />
      </Field>

      <div className={styles.footer}>
        <Button type="submit" loading={save.isPending} disabled={!dirty || !title.trim()}>
          {t('save')}
        </Button>
      </div>
    </form>
      <LessonFilesEditor lessonId={lesson.id} courseId={courseId} files={lesson.files ?? []} />
    </div>
  );
}
