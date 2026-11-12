import {
  Download,
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
  Trash2,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { fileUrl } from '../../lib/format';
import { fileKind, formatFileSize, type FileKind } from '../../lib/files';
import type { LessonFile } from '../../lib/types';
import styles from './FileList.module.scss';

const ICONS: Record<FileKind, typeof File> = {
  pdf: FileText,
  doc: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  archive: FileArchive,
  image: FileImage,
  media: FileVideo,
  code: FileCode,
  other: File,
};

/** Lesson attachments; pass onDelete to show the teacher's remove button. */
export function FileList({
  files,
  onDelete,
}: {
  files: LessonFile[];
  onDelete?: (file: LessonFile) => void;
}) {
  const t = useTranslations('course.files');
  const locale = useLocale();
  return (
    <ul className={styles.list}>
      {files.map((f) => {
        const kind = fileKind(f.name);
        const Icon = ICONS[kind];
        const ext = f.name.split('.').pop()?.toUpperCase();
        return (
          <li key={f.id} className={styles.item}>
            <span className={`${styles.icon} ${styles[kind]}`}>
              <Icon size={20} aria-hidden="true" />
            </span>
            <span className={styles.meta}>
              <a
                href={fileUrl(f.url) ?? f.url}
                target="_blank"
                rel="noopener noreferrer"
                download={f.name}
                className={styles.name}
              >
                {f.name}
              </a>
              <span className={styles.details}>
                {ext} · {formatFileSize(f.size, locale)}
              </span>
            </span>
            {onDelete ? (
              <button
                type="button"
                className={styles.iconBtn}
                aria-label={t('delete', { name: f.name })}
                onClick={() => onDelete(f)}
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            ) : (
              <a
                href={fileUrl(f.url) ?? f.url}
                target="_blank"
                rel="noopener noreferrer"
                download={f.name}
                className={styles.iconBtn}
                aria-label={t('download', { name: f.name })}
              >
                <Download size={18} aria-hidden="true" />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
