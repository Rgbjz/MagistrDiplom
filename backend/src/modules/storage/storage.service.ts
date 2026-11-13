import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { del, put } from '@vercel/blob';
import { randomBytes } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import {
  CLOUDINARY_ROOT,
  formatRef,
  parseRef,
  resourceTypeFor,
} from './cloudinary-ref';
import { CloudinaryService } from './cloudinary.service';

export type UploadFolder =
  | 'avatars'
  | 'courses'
  | 'lessons'
  | 'videos'
  | 'submissions';

/** Avatars and course covers are shown to everyone; the rest is private. */
const PUBLIC_FOLDERS: UploadFolder[] = ['avatars', 'courses'];

/**
 * Stores uploaded files, in this order of preference:
 * - CLOUDINARY_URL: Cloudinary. Public images get their https URL, private
 *   files a `cloudinary://…` reference (see cloudinary-ref) and are only
 *   delivered through signed URLs built by the API;
 * - BLOB_READ_WRITE_TOKEN: Vercel Blob (absolute URL);
 * - otherwise ./public/<folder>, served at /public/<folder>.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly blobToken: string | undefined;
  private readonly cloudinary: CloudinaryService;

  constructor(
    config: ConfigService,
    @Optional() cloudinary?: CloudinaryService,
  ) {
    this.blobToken = config.get<string>('BLOB_READ_WRITE_TOKEN') || undefined;
    this.cloudinary = cloudinary ?? new CloudinaryService(config);
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

    if (this.cloudinary.enabled) {
      const isPublic = PUBLIC_FOLDERS.includes(folder);
      const resourceType = isPublic ? 'image' : resourceTypeFor(file.mimetype);
      // Raw files keep their extension in the id; Cloudinary adds a format
      // to images and videos itself.
      const id = resourceType === 'raw' ? name : name.slice(0, -ext.length);
      const res = await this.cloudinary.uploadBuffer(file.buffer, {
        publicId: `${CLOUDINARY_ROOT}/${folder}/${id}`,
        resourceType,
        type: isPublic ? 'upload' : 'authenticated',
      });
      if (isPublic) return res.secure_url;
      return formatRef({
        resourceType,
        type: 'authenticated',
        publicId: res.public_id,
      });
    }

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
      const ref = parseRef(url) ?? this.cloudinary.refFromUrl(url);
      if (ref) {
        if (this.cloudinary.enabled) await this.cloudinary.destroy(ref);
        return;
      }
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
      url.startsWith('/public/') ||
      url.includes('.blob.vercel-storage.com/') ||
      !!parseRef(url) ||
      !!this.cloudinary.refFromUrl(url)
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
