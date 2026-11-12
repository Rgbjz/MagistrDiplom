'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Paperclip, Upload } from 'lucide-react';
import { clientApi } from '../../lib/api/client';
import { uploadWithProgress } from '../../lib/api/upload';
import { useTranslations } from 'next-intl';
import { useApiErrorMessage } from '../../i18n/format';
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_BYTES } from '../../lib/files';

const MAX_MB = ATTACHMENT_MAX_BYTES / (1024 * 1024);
import type { LessonFile } from '../../lib/types';
import { ConfirmDialog, Progress, useToast } from '../ui';
import { FileList } from '../course/FileList';
import styles from './LessonFilesEditor.module.scss';

interface PendingUpload {
  key: string;
  name: string;
  percent: number;
}

/** Attachments block of the lesson editor: drag & drop, progress, delete. */
export function LessonFilesEditor({
  lessonId,
  courseId,
  files,
}: {
  lessonId: number;
  courseId: number;
  files: LessonFile[];
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const t = useTranslations('builder.files');
  const errorText = useApiErrorMessage();
  const [toDelete, setToDelete] = useState<LessonFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['course', courseId] });

  async function uploadOne(file: File) {
    if (file.size > ATTACHMENT_MAX_BYTES) {
      toast(t('tooLarge', { name: file.name, mb: MAX_MB }), 'error');
      return;
    }
    const key = `${file.name}-${file.size}-${Math.random()}`;
    setPending((p) => [...p, { key, name: file.name, percent: 0 }]);
    const form = new FormData();
    form.append('file', file);
    try {
      await uploadWithProgress<LessonFile>(`/lessons/${lessonId}/files`, form, (percent) =>
        setPending((p) => p.map((u) => (u.key === key ? { ...u, percent } : u))),
      );
      await refresh();
    } catch (e) {
      toast(t('uploadFailed', { name: file.name, reason: errorText(e, t('uploadFailedFallback')) }), 'error');
    } finally {
      setPending((p) => p.filter((u) => u.key !== key));
    }
  }

  function uploadAll(list: FileList | null) {
    if (!list?.length) return;
    // Sequential keeps the backend's per-lesson limit check accurate.
    void Array.from(list).reduce(
      (chain, f) => chain.then(() => uploadOne(f)),
      Promise.resolve(),
    );
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await clientApi(`/lessons/files/${toDelete.id}`, { method: 'DELETE' });
      await refresh();
      toast(t('deleted'));
      setToDelete(null);
    } catch (e) {
      toast(errorText(e, t('deleteFailed')), 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className={styles.block} aria-labelledby={`files-${lessonId}`}>
      <div className={styles.head}>
        <h3 id={`files-${lessonId}`} className={styles.title}>
          <Paperclip size={16} aria-hidden="true" /> {t('title')}
        </h3>
        <span className={styles.hint}>{t('hint', { mb: MAX_MB })}</span>
      </div>

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
          uploadAll(e.dataTransfer.files);
        }}
      >
        <Upload size={22} aria-hidden="true" />
        <span>
          <strong>{t('dropTitle')}</strong> {t('dropHint')}
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            uploadAll(e.target.files);
            e.target.value = '';
          }}
        />
      </label>

      {pending.length > 0 && (
        <ul className={styles.pending} aria-live="polite">
          {pending.map((u) => (
            <li key={u.key} className={styles.pendingItem}>
              <span className={styles.pendingName}>{u.name}</span>
              <Progress value={u.percent} label={t('uploading', { name: u.name })} showValue size="sm" />
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 ? (
        <FileList files={files} onDelete={setToDelete} />
      ) : (
        pending.length === 0 && <p className={styles.empty}>{t('empty')}</p>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title={t('confirmTitle')}
        description={toDelete ? t('confirmText', { name: toDelete.name }) : undefined}
        confirmLabel={t('confirmDelete')}
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </section>
  );
}
