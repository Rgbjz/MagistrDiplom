import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { del, put } from '@vercel/blob';
import { randomBytes } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';

export type UploadFolder =
  | 'avatars'
  | 'courses'
  | 'lessons'
  | 'videos'
  | 'submissions';

/**
 * Stores uploaded files. With BLOB_READ_WRITE_TOKEN they go to Vercel Blob
 * (absolute URL); otherwise to ./public/<folder> served at /public/<folder>.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly blobToken: string | undefined;

  constructor(config: ConfigService) {
    this.blobToken = config.get<string>('BLOB_READ_WRITE_TOKEN') || undefined;
  }

  async save(file: Express.Multer.File, folder: UploadFolder): Promise<string> {
    if (!file.size || !file.buffer?.length) {
      throw new BadRequestException('Empty file');
    }
    if (
      (folder === 'avatars' || folder === 'courses') &&
      !isImage(file.buffer)
    ) {
      throw new BadRequestException('File is not a valid image');
    }
    const ext = extname(file.originalname).toLowerCase() || '.bin';
    const name = `${folder}-${Date.now()}-${randomBytes(4).toString('hex')}${ext}`;

    if (this.blobToken) {
      const blob = await put(`${folder}/${name}`, file.buffer, {
        access: 'public',
        addRandomSuffix: true,
        contentType: file.mimetype,
        token: this.blobToken,
      });
      return blob.url;
    }

    const dir = join(process.cwd(), 'public', folder);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), file.buffer);
    this.logger.debug(`Saved ${name} to local disk`);
    return `/public/${folder}/${name}`;
  }

  /** Best-effort removal of a file previously returned by save(). */
  async remove(url: string | null | undefined): Promise<void> {
    if (!url) return;
    try {
      if (/^https?:\/\//.test(url)) {
        if (this.blobToken && url.includes('.blob.vercel-storage.com/')) {
          await del(url, { token: this.blobToken });
        }
        return;
      }
      const match =
        /^\/public\/(avatars|courses|lessons|videos|submissions)\/([\w.-]+)$/.exec(
          url,
        );
      if (match) {
        await unlink(join(process.cwd(), 'public', match[1], match[2]));
      }
    } catch (err) {
      this.logger.warn(`Could not remove ${url}: ${(err as Error).message}`);
    }
  }

  /** True when the URL points at a file this service stored. */
  isStored(url: string | null | undefined): boolean {
    if (!url) return false;
    return (
      url.startsWith('/public/') || url.includes('.blob.vercel-storage.com/')
    );
  }
}

/**
 * Multer decodes multipart filenames as latin1; browsers send UTF-8, so
 * Cyrillic names arrive garbled unless re-decoded.
 */
export function originalName(file: Express.Multer.File): string {
  const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
  const name = decoded.includes('�') ? file.originalname : decoded;
  return name.replace(/[\\/\r\n]/g, '_').slice(0, 200);
}

/** Checks the magic bytes of PNG, JPEG, GIF and WebP — the extension can lie. */
export function isImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const png = buf
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const gif = buf.subarray(0, 4).toString('ascii') === 'GIF8';
  const webp =
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP';
  return png || jpeg || gif || webp;
}
