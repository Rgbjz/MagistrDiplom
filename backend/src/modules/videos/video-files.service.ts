import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { del, list, put } from '@vercel/blob';
import { randomBytes } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { cp, mkdir, readdir, readFile, rm, stat, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as WebReadableStream } from 'stream/web';
import {
  CLOUDINARY_ROOT,
  type CloudinaryRef,
  formatRef,
  parseRef,
} from '../storage/cloudinary-ref';
import {
  CloudinaryService,
  type UploadedVideo,
} from '../storage/cloudinary.service';

const CONTENT_TYPES: Record<string, string> = {
  m3u8: 'application/vnd.apple.mpegurl',
  ts: 'video/mp2t',
  jpg: 'image/jpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

export function contentTypeOf(file: string): string {
  const ext = file.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/** Where a stored video file can be read from. */
export type FileLocation =
  | { kind: 'local'; path: string }
  | { kind: 'remote'; url: string };

/**
 * Video sources and HLS outputs. Locally they live under ./private (never
 * served statically — only through signed /api/files/hls routes); with
 * BLOB_READ_WRITE_TOKEN they go to Vercel Blob under unguessable prefixes.
 * With CLOUDINARY_URL (takes precedence) the source is uploaded to
 * Cloudinary, which builds and serves the HLS renditions itself; the
 * record then keeps `cloudinary://video/upload/<public id>` as its prefix.
 */
@Injectable()
export class VideoFilesService {
  private readonly logger = new Logger(VideoFilesService.name);
  readonly blobToken: string | undefined;
  readonly root = join(process.cwd(), 'private');
  readonly cloudinary: CloudinaryService;
  /** Waits between readiness checks of Cloudinary's HLS (replaced in tests). */
  sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  constructor(
    config: ConfigService,
    @Optional() cloudinary?: CloudinaryService,
  ) {
    this.blobToken = config.get<string>('BLOB_READ_WRITE_TOKEN') || undefined;
    this.cloudinary = cloudinary ?? new CloudinaryService(config);
  }

  get cloudinaryMode(): boolean {
    return this.cloudinary.enabled;
  }

  /** Browser uploads straight to Blob (not when Cloudinary is in use). */
  get blobMode(): boolean {
    return !!this.blobToken && !this.cloudinaryMode;
  }

  /** Uploads a local source to Cloudinary under an unguessable public id. */
  async uploadToCloudinary(
    videoId: number,
    path: string,
  ): Promise<UploadedVideo & { prefix: string }> {
    const publicId = `${CLOUDINARY_ROOT}/videos/${videoId}-${randomBytes(12).toString('hex')}`;
    const uploaded = await this.cloudinary.uploadVideo(path, publicId);
    return { ...uploaded, prefix: formatRef(uploaded.ref) };
  }

  /**
   * Polls the HLS master playlist on Cloudinary's CDN until the background
   * (eager) renditions are ready. `onWait` gets the share of time used.
   */
  async waitForCloudinaryHls(
    ref: CloudinaryRef,
    onWait?: (fraction: number) => void,
    timeoutMs = 30 * 60 * 1000,
    intervalMs = 10_000,
  ): Promise<void> {
    const url = this.cloudinary.hlsUrl(ref);
    const started = Date.now();
    for (;;) {
      const res = await fetch(url, { method: 'HEAD' }).catch(() => null);
      if (res?.ok) return;
      const spent = Date.now() - started;
      if (spent >= timeoutMs)
        throw new Error(
          'Cloudinary did not finish preparing the video in time',
        );
      onWait?.(spent / timeoutMs);
      await this.sleep(intervalMs);
    }
  }

  /** Blob store id from the token: vercel_blob_rw_<storeId>_<secret>. */
  get blobStoreId(): string | null {
    const m = /^vercel_blob_rw_([A-Za-z0-9]+)_/.exec(this.blobToken ?? '');
    return m ? m[1].toLowerCase() : null;
  }

  dir(...parts: string[]) {
    return join(this.root, ...parts);
  }

  /** Resolves a stored URL (/private/…, legacy /public/videos/…, or http). */
  locate(url: string): FileLocation | null {
    if (/^https?:\/\//.test(url)) return { kind: 'remote', url };
    const m = /^\/(private|public)\/([\w./-]+)$/.exec(url);
    if (!m || m[2].includes('..')) return null;
    return { kind: 'local', path: join(process.cwd(), m[1], m[2]) };
  }

  /** A file inside an HLS output prefix. */
  locateHls(prefix: string, file: string): FileLocation | null {
    if (/^https?:\/\//.test(prefix))
      return { kind: 'remote', url: prefix + file };
    if (!/^hls\/[\w-]+$/.test(prefix)) return null;
    return { kind: 'local', path: join(this.root, prefix, file) };
  }

  async readText(loc: FileLocation): Promise<string> {
    if (loc.kind === 'local') return readFile(loc.path, 'utf8');
    const res = await fetch(loc.url);
    if (!res.ok) throw new Error(`Fetch ${loc.url}: ${res.status}`);
    return res.text();
  }

  async size(loc: FileLocation): Promise<number | null> {
    try {
      if (loc.kind === 'local') return (await stat(loc.path)).size;
      const res = await fetch(loc.url, { method: 'HEAD' });
      const len = res.headers.get('content-length');
      return res.ok && len ? Number(len) : null;
    } catch {
      return null;
    }
  }

  /** Makes the source available as a local file (downloads Blob sources). */
  async localCopy(url: string, workDir: string): Promise<string> {
    const loc = this.locate(url);
    if (!loc) throw new Error(`Unknown video location ${url}`);
    if (loc.kind === 'local') return loc.path;
    const target = join(workDir, 'source');
    const res = await fetch(loc.url);
    if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`);
    await pipeline(
      Readable.fromWeb(res.body as unknown as WebReadableStream),
      createWriteStream(target),
    );
    return target;
  }

  async workDir(videoId: number): Promise<string> {
    const dir = join(
      tmpdir(),
      `lms-video-${videoId}-${randomBytes(4).toString('hex')}`,
    );
    await mkdir(dir, { recursive: true });
    return dir;
  }

  /** Uploads/copies a finished HLS folder; returns the prefix to store. */
  async publishHls(videoId: number, outDir: string): Promise<string> {
    const name = `${videoId}-${randomBytes(8).toString('hex')}`;
    const files = await readdir(outDir);
    if (this.blobToken) {
      let base = '';
      for (const file of files) {
        const blob = await put(
          `hls/${name}/${file}`,
          createReadStream(join(outDir, file)),
          {
            access: 'public',
            addRandomSuffix: false,
            contentType: contentTypeOf(file),
            token: this.blobToken,
          },
        );
        if (file === 'master.m3u8')
          base = blob.url.slice(0, -'master.m3u8'.length);
      }
      return base;
    }
    const target = this.dir('hls', name);
    await mkdir(this.dir('hls'), { recursive: true });
    await cp(outDir, target, { recursive: true });
    return `hls/${name}`;
  }

  /** Best-effort removal of an HLS prefix. */
  async removeHls(prefix: string | null | undefined): Promise<void> {
    if (!prefix) return;
    try {
      const ref = parseRef(prefix);
      if (ref) {
        if (this.cloudinaryMode) await this.cloudinary.destroy(ref);
        return;
      }
      if (/^https?:\/\//.test(prefix)) {
        if (!this.blobToken) return;
        const pathname = new URL(prefix).pathname.slice(1);
        const { blobs } = await list({
          prefix: pathname,
          token: this.blobToken,
        });
        if (blobs.length)
          await del(
            blobs.map((b) => b.url),
            { token: this.blobToken },
          );
        return;
      }
      if (/^hls\/[\w-]+$/.test(prefix)) {
        await rm(join(this.root, prefix), { recursive: true, force: true });
      }
    } catch (err) {
      this.logger.warn(`Could not remove ${prefix}: ${(err as Error).message}`);
    }
  }

  /** Best-effort removal of a source/MP4 file (private, legacy public or Blob). */
  async removeFile(url: string | null | undefined): Promise<void> {
    if (!url) return;
    try {
      const ref = parseRef(url);
      if (ref) {
        if (this.cloudinaryMode) await this.cloudinary.destroy(ref);
        return;
      }
      const loc = this.locate(url);
      if (!loc) return;
      if (loc.kind === 'local') await unlink(loc.path);
      else if (this.blobToken && url.includes('.blob.vercel-storage.com/'))
        await del(url, { token: this.blobToken });
    } catch (err) {
      this.logger.warn(`Could not remove ${url}: ${(err as Error).message}`);
    }
  }

  async removeDir(dir: string) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
