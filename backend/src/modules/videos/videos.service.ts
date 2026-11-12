import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LessonVideo } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertCourseRole,
  can,
  getCourseRole,
} from '../../common/access/course-access';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ALLOWED_VIDEO_TYPES, MAX_VIDEO_BYTES } from './hls';
import { TranscodeService } from './transcode.service';
import { CHUNK_SIZE, UploadsService } from './uploads.service';
import { VideoFilesService } from './video-files.service';

export type UploadInit =
  | {
      mode: 'chunked';
      uploadId: string;
      chunkSize: number;
      totalChunks: number;
    }
  | {
      mode: 'blob';
      pathname: string;
      handleUploadUrl: string;
      maxSize: number;
    };

@Injectable()
export class VideosService implements OnApplicationBootstrap {
  private readonly logger = new Logger(VideosService.name);
  /** Short-lived cache of read checks — a player fetches many segments. */
  private readonly readCache = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private files: VideoFilesService,
    private uploads: UploadsService,
    private transcoder: TranscodeService,
    private config: ConfigService,
  ) {}

  // ----- access

  private async lessonCourse(lessonId: number) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, section: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return lesson.section.courseId;
  }

  /** Course staff with content rights (owner/teacher) or an admin. */
  async assertCanEdit(lessonId: number, user: AuthUser) {
    const courseId = await this.lessonCourse(lessonId);
    await assertCourseRole(this.prisma, courseId, user, 'content');
  }

  /** Staff of the course, an admin, or an ACTIVE student may watch. */
  async canWatch(lessonId: number, userId: number): Promise<boolean> {
    const key = `${lessonId}:${userId}`;
    const cached = this.readCache.get(key);
    if (cached && cached > Date.now()) return true;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, blocked: true },
    });
    if (!user || user.blocked) return false;
    const courseId = await this.lessonCourse(lessonId);
    let ok = can(await getCourseRole(this.prisma, courseId, user), 'view');
    if (!ok) {
      const enrollment = await this.prisma.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId } },
        select: { status: true },
      });
      ok = enrollment?.status === 'ACTIVE';
    }
    if (ok) this.readCache.set(key, Date.now() + 60_000);
    if (this.readCache.size > 5000) this.readCache.clear();
    return ok;
  }

  // ----- uploads

  async initUpload(
    lessonId: number,
    user: AuthUser,
    input: { size: number; mime: string; name: string },
  ): Promise<UploadInit> {
    await this.assertCanEdit(lessonId, user);
    if (!ALLOWED_VIDEO_TYPES[input.mime])
      throw new BadRequestException('Unsupported video type');
    if (input.size > MAX_VIDEO_BYTES)
      throw new BadRequestException('File too large');
    if (this.files.blobMode) {
      return {
        mode: 'blob',
        pathname: `video-src/lesson-${lessonId}${ALLOWED_VIDEO_TYPES[input.mime]}`,
        handleUploadUrl: `/lessons/${lessonId}/video/upload-token`,
        maxSize: MAX_VIDEO_BYTES,
      };
    }
    const s = await this.uploads.create(lessonId, user.id, input);
    return {
      mode: 'chunked',
      uploadId: s.uploadId,
      chunkSize: CHUNK_SIZE,
      totalChunks: s.totalChunks,
    };
  }

  async uploadStatus(uploadId: string, user: AuthUser) {
    const s = await this.uploads.get(uploadId, user.id);
    return {
      uploadId,
      lessonId: s.lessonId,
      size: s.size,
      chunkSize: s.chunkSize,
      totalChunks: s.totalChunks,
      received: await this.uploads.received(s),
    };
  }

  async putChunk(
    uploadId: string,
    index: number,
    user: AuthUser,
    body: NodeJS.ReadableStream,
  ) {
    const s = await this.uploads.get(uploadId, user.id);
    await this.uploads.writeChunk(
      s,
      index,
      body as unknown as import('stream').Readable,
    );
    return { index };
  }

  async completeUpload(uploadId: string, user: AuthUser) {
    const s = await this.uploads.get(uploadId, user.id);
    await this.assertCanEdit(s.lessonId, user);
    const url = await this.uploads.assemble(s);
    return this.attachSource(s.lessonId, url, s.size);
  }

  /** Client-side Blob upload finished: verify the URL is ours, then process. */
  async completeBlobUpload(lessonId: number, user: AuthUser, url: string) {
    await this.assertCanEdit(lessonId, user);
    if (!this.isOwnBlobSource(url))
      throw new BadRequestException('Unknown upload URL');
    const existing = await this.prisma.lessonVideo.findUnique({
      where: { lessonId },
    });
    if (existing?.sourceUrl === url) return existing; // webhook got here first
    const size = await this.files.size({ kind: 'remote', url });
    if (!size) throw new BadRequestException('Upload not found');
    return this.attachSource(lessonId, url, size);
  }

  isOwnBlobSource(url: string): boolean {
    const store = this.files.blobStoreId;
    try {
      const u = new URL(url);
      return (
        u.protocol === 'https:' &&
        !!store &&
        u.hostname.startsWith(`${store}.`) &&
        u.hostname.endsWith('.blob.vercel-storage.com') &&
        u.pathname.startsWith('/video-src/')
      );
    } catch {
      return false;
    }
  }

  /** Replaces the lesson's video with a new source and queues transcoding. */
  async attachSource(lessonId: number, sourceUrl: string, sizeBytes: number) {
    const previous = await this.prisma.lessonVideo.findUnique({
      where: { lessonId },
    });
    if (previous?.sourceUrl === sourceUrl) return previous;
    const video = await this.prisma.lessonVideo.upsert({
      where: { lessonId },
      create: { lessonId, status: 'PROCESSING', sourceUrl, sizeBytes },
      update: {
        status: 'PROCESSING',
        progress: 0,
        sourceUrl,
        sizeBytes,
        mp4Url: null,
        hlsPrefix: null,
        renditions: null,
        hasPoster: false,
        durationSec: null,
        width: null,
        height: null,
        error: null,
      },
    });
    if (previous) await this.removeOutputs(previous);
    await this.transcoder.enqueue(video.id, sourceUrl, video.updatedAt);
    return video;
  }

  // ----- read / delete / retry

  async get(lessonId: number, user: AuthUser) {
    if (!(await this.canWatch(lessonId, user.id)))
      throw new ForbiddenException('Access denied');
    return this.prisma.lessonVideo.findUnique({ where: { lessonId } });
  }

  async remove(lessonId: number, user: AuthUser) {
    await this.assertCanEdit(lessonId, user);
    const video = await this.prisma.lessonVideo.findUnique({
      where: { lessonId },
    });
    if (!video) return;
    await this.prisma.lessonVideo.delete({ where: { id: video.id } });
    await this.removeOutputs(video);
  }

  async retry(lessonId: number, user: AuthUser) {
    await this.assertCanEdit(lessonId, user);
    const video = await this.prisma.lessonVideo.findUnique({
      where: { lessonId },
    });
    const source = video?.sourceUrl ?? video?.mp4Url;
    if (!video || !source) throw new NotFoundException('Video not found');
    const updated = await this.prisma.lessonVideo.update({
      where: { id: video.id },
      data: {
        status: video.mp4Url && !video.sourceUrl ? 'READY' : 'PROCESSING',
        progress: 0,
        error: null,
      },
    });
    await this.transcoder.enqueue(video.id, source, updated.updatedAt);
    return updated;
  }

  /** Used when a lesson is deleted: the DB row cascades, files don't. */
  async removeForLesson(lessonId: number) {
    const video = await this.prisma.lessonVideo.findUnique({
      where: { lessonId },
    });
    if (video) await this.removeOutputs(video);
  }

  /** Called before a course is deleted (rows cascade, files don't). */
  async removeForCourse(courseId: number) {
    const videos = await this.prisma.lessonVideo.findMany({
      where: { lesson: { section: { courseId } } },
    });
    for (const video of videos) await this.removeOutputs(video);
  }

  private async removeOutputs(video: LessonVideo) {
    await this.files.removeHls(video.hlsPrefix);
    await this.files.removeFile(video.sourceUrl);
    if (video.mp4Url && video.mp4Url !== video.sourceUrl)
      await this.files.removeFile(video.mp4Url);
  }

  /**
   * After a restart: re-queue videos left PROCESSING (a crash mid-job) and
   * legacy progressive MP4 uploads that never got HLS. Job ids include the
   * record's updatedAt, so several instances don't duplicate the work.
   */
  async onApplicationBootstrap() {
    if (this.config.get<string>('VIDEO_RECONCILE') === 'false') return;
    try {
      const pending = await this.prisma.lessonVideo.findMany({
        where: {
          OR: [
            { status: 'PROCESSING' },
            {
              status: 'READY',
              hlsPrefix: null,
              error: null,
              mp4Url: { not: null },
            },
          ],
        },
      });
      for (const v of pending) {
        const source = v.sourceUrl ?? v.mp4Url;
        if (source) await this.transcoder.enqueue(v.id, source, v.updatedAt);
      }
      if (pending.length)
        this.logger.log(`Re-queued ${pending.length} video(s) for transcoding`);
    } catch (err) {
      this.logger.warn(
        `Video reconciliation failed: ${(err as Error).message}`,
      );
    }
  }
}
