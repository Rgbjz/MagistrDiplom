import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

/** Images kept in memory, then handed to StorageService. */
export function imageUploadOptions(maxBytes: number): MulterOptions {
  return {
    storage: memoryStorage(),
    limits: { fileSize: maxBytes },
    fileFilter: (_req, file, cb) =>
      cb(null, file.mimetype.startsWith('image/')),
  };
}

export const LESSON_FILE_MAX_BYTES = 25 * 1024 * 1024;
export const LESSON_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

// Documents and archives a teacher may attach. SVG/HTML are excluded on
// purpose: served from our origin they could run scripts.
const ATTACHMENT_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',
  '.rtf',
  '.txt',
  '.md',
  '.csv',
  '.zip',
  '.rar',
  '.7z',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.mp3',
  '.mp4',
  '.webm',
  '.json',
  '.sql',
  '.js',
  '.ts',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.css',
]);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm']);

function filtered(
  allowed: Set<string>,
  maxBytes: number,
  label: string,
  files = 1,
): MulterOptions {
  return {
    storage: memoryStorage(),
    limits: { fileSize: maxBytes, files },
    fileFilter: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      if (allowed.has(ext)) return cb(null, true);
      cb(
        new BadRequestException(`Unsupported ${label} type: ${ext || 'none'}`),
        false,
      );
    },
  };
}

export const lessonFileUploadOptions = filtered(
  ATTACHMENT_EXTENSIONS,
  LESSON_FILE_MAX_BYTES,
  'file',
);
export const lessonVideoUploadOptions = filtered(
  VIDEO_EXTENSIONS,
  LESSON_VIDEO_MAX_BYTES,
  'video',
);

/** Hard cap per request; each assignment may allow fewer (maxFiles). */
export const SUBMISSION_MAX_FILES = 10;

export const submissionUploadOptions = filtered(
  ATTACHMENT_EXTENSIONS,
  LESSON_FILE_MAX_BYTES,
  'file',
  SUBMISSION_MAX_FILES,
);
