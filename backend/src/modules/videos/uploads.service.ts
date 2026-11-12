import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'fs/promises';
import { join } from 'path';
import type { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { ALLOWED_VIDEO_TYPES, looksLikeVideo, MAX_VIDEO_BYTES } from './hls';
import { VideoFilesService } from './video-files.service';

/** 8 MB: small enough for flaky connections, large enough to stay fast. */
export const CHUNK_SIZE = 8 * 1024 * 1024;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface UploadSession {
  uploadId: string;
  lessonId: number;
  userId: number;
  size: number;
  mime: string;
  name: string;
  chunkSize: number;
  totalChunks: number;
  createdAt: number;
}

/** Thrown while streaming a chunk that is longer than announced. */
class ChunkTooLarge extends Error {}

/**
 * Resumable chunked uploads to local disk (dev / no Blob token): the client
 * PUTs fixed-size chunks that are streamed to ./private/video-uploads/<id>/
 * — never buffered in memory — and asks which ones arrived to resume.
 */
@Injectable()
export class UploadsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UploadsService.name);

  constructor(private files: VideoFilesService) {}

  private dir(uploadId: string) {
    if (!/^[a-f0-9]{32}$/.test(uploadId))
      throw new NotFoundException('Upload not found');
    return this.files.dir('video-uploads', uploadId);
  }

  async create(
    lessonId: number,
    userId: number,
    input: { size: number; mime: string; name: string },
  ): Promise<UploadSession> {
    if (!ALLOWED_VIDEO_TYPES[input.mime])
      throw new BadRequestException('Unsupported video type');
    if (!Number.isInteger(input.size) || input.size <= 0)
      throw new BadRequestException('Empty file');
    if (input.size > MAX_VIDEO_BYTES)
      throw new BadRequestException('File too large');
    const session: UploadSession = {
      uploadId: randomBytes(16).toString('hex'),
      lessonId,
      userId,
      size: input.size,
      mime: input.mime,
      name: String(input.name ?? 'video').slice(0, 200),
      chunkSize: CHUNK_SIZE,
      totalChunks: Math.ceil(input.size / CHUNK_SIZE),
      createdAt: Date.now(),
    };
    const dir = this.dir(session.uploadId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'meta.json'), JSON.stringify(session));
    return session;
  }

  async get(uploadId: string, userId: number): Promise<UploadSession> {
    let session: UploadSession;
    try {
      session = JSON.parse(
        await readFile(join(this.dir(uploadId), 'meta.json'), 'utf8'),
      ) as UploadSession;
    } catch {
      throw new NotFoundException('Upload not found');
    }
    if (session.userId !== userId)
      throw new ForbiddenException('Access denied');
    return session;
  }

  /** Indexes of chunks already stored (for resuming). */
  async received(session: UploadSession): Promise<number[]> {
    const names = await readdir(this.dir(session.uploadId));
    return names
      .map((n) => /^(\d+)\.part$/.exec(n)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number)
      .sort((a, b) => a - b);
  }

  expectedLength(session: UploadSession, index: number): number {
    if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks)
      throw new BadRequestException('Invalid chunk index');
    return index < session.totalChunks - 1
      ? session.chunkSize
      : session.size - session.chunkSize * (session.totalChunks - 1);
  }

  /** Streams one chunk to disk; its length must match exactly. */
  async writeChunk(session: UploadSession, index: number, body: Readable) {
    const expected = this.expectedLength(session, index);
    const dir = this.dir(session.uploadId);
    const tmp = join(dir, `${index}.${randomBytes(4).toString('hex')}.tmp`);
    let written = 0;
    body.on('data', (chunk: Buffer) => {
      written += chunk.length;
      if (written > expected) body.destroy(new ChunkTooLarge());
    });
    try {
      await pipeline(body, createWriteStream(tmp));
    } catch (err) {
      await unlink(tmp).catch(() => undefined);
      if (err instanceof ChunkTooLarge)
        throw new BadRequestException('Chunk is larger than expected');
      throw err;
    }
    if (written !== expected) {
      await unlink(tmp).catch(() => undefined);
      throw new BadRequestException(
        `Chunk ${index} has ${written} bytes, expected ${expected}`,
      );
    }
    await rename(tmp, join(dir, `${index}.part`));
  }

  /**
   * Concatenates all chunks into ./private/video-src/<name> and checks size
   * and container signature. Returns the stored source URL.
   */
  async assemble(session: UploadSession): Promise<string> {
    const got = await this.received(session);
    if (got.length !== session.totalChunks)
      throw new BadRequestException('Upload is incomplete');
    const dir = this.dir(session.uploadId);
    const ext = ALLOWED_VIDEO_TYPES[session.mime];
    const name = `lesson-${session.lessonId}-${Date.now()}-${randomBytes(4).toString('hex')}${ext}`;
    await mkdir(this.files.dir('video-src'), { recursive: true });
    const target = this.files.dir('video-src', name);
    const out = createWriteStream(target);
    try {
      for (let i = 0; i < session.totalChunks; i++) {
        await pipeline(createReadStream(join(dir, `${i}.part`)), out, {
          end: false,
        });
      }
    } finally {
      out.end();
      await new Promise<void>((resolve) => out.on('close', () => resolve()));
    }
    const size = (await stat(target)).size;
    const head = Buffer.alloc(16);
    const fh = await open(target, 'r');
    await fh.read(head, 0, 16, 0);
    await fh.close();
    if (size !== session.size || !looksLikeVideo(head)) {
      await unlink(target).catch(() => undefined);
      throw new BadRequestException(
        size !== session.size ? 'Size mismatch' : 'File is not a video',
      );
    }
    await rm(dir, { recursive: true, force: true });
    return `/private/video-src/${name}`;
  }

  /** Drops upload sessions abandoned for more than a day. */
  async onApplicationBootstrap() {
    try {
      const root = this.files.dir('video-uploads');
      const ids = await readdir(root).catch(() => [] as string[]);
      for (const id of ids) {
        const meta = join(root, id, 'meta.json');
        const created = await stat(meta)
          .then((s) => s.mtimeMs)
          .catch(() => 0);
        if (Date.now() - created > SESSION_TTL_MS) {
          await rm(join(root, id), { recursive: true, force: true });
        }
      }
    } catch (err) {
      this.logger.warn(`Upload cleanup failed: ${(err as Error).message}`);
    }
  }
}
