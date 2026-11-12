'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Pause, Play, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { clientApi } from '../../lib/api/client';
import {
  UploadPaused,
  VIDEO_UPLOAD_ACCEPT,
  VIDEO_UPLOAD_MAX_BYTES,
  VIDEO_UPLOAD_TYPES,
  VideoUpload,
  videoMime,
} from '../../lib/api/videoUpload';
import type { LessonVideo } from '../../lib/types';
import { useApiErrorMessage } from '../../i18n/format';
import { Button, ConfirmDialog, Progress, useToast } from '../ui';
import { VideoPlayer } from './VideoPlayer';
import styles from './video.module.scss';

const MAX_GB = VIDEO_UPLOAD_MAX_BYTES / 1024 ** 3;

type Transfer =
  | { state: 'uploading'; percent: number }
  | { state: 'paused'; percent: number }
  | { state: 'error'; percent: number; message: string };

function formatDuration(sec: number | null): string {
  if (!sec) return '—';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/**
 * Lesson editor block for an uploaded video: drag & drop, upload with real
 * progress (pause/resume for chunked uploads, retry), then server-side
 * processing progress, preview, replace and delete.
 */
export function VideoUploader({
  lessonId,
  courseId,
  title,
  video: initial,
}: {
  lessonId: number;
  courseId: number;
  title: string;
  video: LessonVideo | null;
}) {
  const t = useTranslations('video.uploader');
  const toast = useToast();
  const errorText = useApiErrorMessage();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<VideoUpload | null>(null);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: video } = useQuery({
    queryKey: ['lesson-video', lessonId],
    queryFn: async () =>
      (await clientApi<{ video: LessonVideo | null }>(`/lessons/${lessonId}/video`)).video,
    initialData: initial,
    refetchInterval: (q) => (q.state.data?.status === 'PROCESSING' ? 2000 : false),
  });

  // Processing finished: refresh the course so the lesson shows the player.
  const lastStatus = useRef(video?.status);
  useEffect(() => {
    if (lastStatus.current === 'PROCESSING' && video?.status !== 'PROCESSING') {
      void queryClient.invalidateQueries({ queryKey: ['course', courseId] });
    }
    lastStatus.current = video?.status;
  }, [video?.status, courseId, queryClient]);

  useEffect(() => () => uploadRef.current?.cancel(), []);

  function validate(file: File): string | null {
    if (!VIDEO_UPLOAD_TYPES.includes(videoMime(file))) return t('unsupported');
    if (file.size > VIDEO_UPLOAD_MAX_BYTES) return t('tooLarge', { gb: MAX_GB });
    return null;
  }

  async function run(upload: VideoUpload) {
    setTransfer((s) => ({ state: 'uploading', percent: s?.percent ?? 0 }));
    try {
      const result = await upload.run();
      uploadRef.current = null;
      setTransfer(null);
      queryClient.setQueryData(['lesson-video', lessonId], result);
      toast(t('uploaded'));
    } catch (err) {
      if (err instanceof UploadPaused) {
        setTransfer((s) => (s ? { state: 'paused', percent: s.percent } : s));
        return;
      }
      setTransfer((s) => ({
        state: 'error',
        percent: s?.percent ?? 0,
        message: errorText(err, t('failedUpload')),
      }));
    }
  }

  function start(file: File | undefined) {
    if (!file) return;
    const problem = validate(file);
    if (problem) {
      toast(problem, 'error');
      return;
    }
    uploadRef.current?.cancel();
    const upload = new VideoUpload(lessonId, file, (fraction) =>
      setTransfer((s) =>
        s && s.state !== 'uploading' ? s : { state: 'uploading', percent: Math.floor(fraction * 100) },
      ),
    );
    uploadRef.current = upload;
    setTransfer({ state: 'uploading', percent: 0 });
    void run(upload);
  }

  async function retryProcessing() {
    setBusy(true);
    try {
      const v = await clientApi<LessonVideo>(`/lessons/${lessonId}/video/retry`, { method: 'POST' });
      queryClient.setQueryData(['lesson-video', lessonId], v);
    } catch (e) {
      toast(errorText(e, t('failed')), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await clientApi(`/lessons/${lessonId}/video`, { method: 'DELETE' });
      queryClient.setQueryData(['lesson-video', lessonId], null);
      await queryClient.invalidateQueries({ queryKey: ['course', courseId] });
      toast(t('deleted'));
      setConfirmDelete(false);
    } catch (e) {
      toast(errorText(e, t('deleteFailed')), 'error');
    } finally {
      setBusy(false);
    }
  }

  const picker = (
    <input
      ref={inputRef}
      type="file"
      accept={VIDEO_UPLOAD_ACCEPT}
      className="sr-only"
      aria-label={t('fileInputLabel')}
      data-testid="video-file-input"
      onChange={(e) => {
        start(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );

  return (
    <section className={styles.uploader} aria-label={t('region')}>
      {transfer ? (
        <div className={styles.status} aria-live="polite">
          <div className={styles.statusRow}>
            <span>
              {transfer.state === 'paused'
                ? t('paused', { percent: transfer.percent })
                : transfer.state === 'error'
                  ? t('failedUpload')
                  : t('uploading', { percent: transfer.percent })}
            </span>
            <div className={styles.actions}>
              {transfer.state === 'uploading' && uploadRef.current?.resumable && (
                <Button type="button" variant="outline" size="sm" onClick={() => uploadRef.current?.pause()}>
                  <Pause size={14} aria-hidden="true" /> {t('pause')}
                </Button>
              )}
              {transfer.state === 'paused' && uploadRef.current && (
                <Button type="button" size="sm" onClick={() => void run(uploadRef.current!)}>
                  <Play size={14} aria-hidden="true" /> {t('resume')}
                </Button>
              )}
              {transfer.state === 'error' && uploadRef.current && (
                <Button type="button" size="sm" onClick={() => void run(uploadRef.current!)}>
                  <RotateCcw size={14} aria-hidden="true" /> {t('retry')}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  uploadRef.current?.cancel();
                  uploadRef.current = null;
                  setTransfer(null);
                }}
              >
                <X size={14} aria-hidden="true" /> {t('cancel')}
              </Button>
            </div>
          </div>
          <Progress value={transfer.percent} label={t('progressLabel')} showValue />
          {transfer.state === 'error' && <p className={styles.error}>{transfer.message}</p>}
        </div>
      ) : video?.status === 'PROCESSING' ? (
        <div className={styles.status} aria-live="polite">
          <div className={styles.statusRow}>
            <span>{t('processing', { percent: video.progress })}</span>
          </div>
          <Progress value={video.progress} label={t('processingLabel')} showValue />
          <p className={styles.hint}>{t('processingHint')}</p>
        </div>
      ) : video ? (
        <>
          {video.status === 'READY' && (
            <VideoPlayer video={video} title={title} compact />
          )}
          <div className={styles.status}>
            <div className={styles.statusRow}>
              <span>{video.status === 'FAILED' ? t('failed') : t('ready')}</span>
              {video.status === 'READY' && (
                <span className={styles.hint}>
                  {t('readyMeta', {
                    duration: formatDuration(video.durationSec),
                    qualities: video.qualities.length
                      ? video.qualities.map((q) => `${q}p`).join(', ')
                      : 'MP4',
                  })}
                </span>
              )}
            </div>
            {video.status === 'READY' && !video.hlsUrl && (
              <p className={styles.hint}>{t('progressiveOnly')}</p>
            )}
            {video.error && video.status === 'FAILED' && (
              <p className={styles.error}>{video.error}</p>
            )}
            <div className={styles.actions}>
              {video.status === 'FAILED' && (
                <Button type="button" size="sm" loading={busy} onClick={() => void retryProcessing()}>
                  <RotateCcw size={14} aria-hidden="true" /> {t('retry')}
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                <Upload size={14} aria-hidden="true" /> {t('replace')}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} aria-hidden="true" /> {t('delete')}
              </Button>
            </div>
          </div>
          {picker}
        </>
      ) : (
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
            start(e.dataTransfer.files?.[0]);
          }}
        >
          <Upload size={24} aria-hidden="true" />
          <strong>{t('drop')}</strong>
          <span>{t('formats', { gb: MAX_GB })}</span>
          {picker}
        </label>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t('confirmDeleteTitle')}
        description={t('confirmDeleteText')}
        confirmLabel={t('delete')}
        danger
        loading={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </section>
  );
}
