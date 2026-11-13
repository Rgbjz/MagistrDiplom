import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  expiryFor,
  type FileKind,
  protectedFolder,
  signature,
  verifySignature,
} from './file-urls';
import { can, getCourseRole } from '../../common/access/course-access';
import { parseRef } from '../storage/cloudinary-ref';
import { CloudinaryService } from '../storage/cloudinary.service';

export interface ResolvedFile {
  url: string;
  name: string;
  mimeType: string;
}

const VIDEO_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
};

@Injectable()
export class FilesService {
  private readonly secret: string;
  private readonly base: string;
  private readonly cloudinary: CloudinaryService;

  constructor(
    private prisma: PrismaService,
    config: ConfigService,
    @Optional() cloudinary?: CloudinaryService,
  ) {
    this.cloudinary = cloudinary ?? new CloudinaryService(config);
    this.secret =
      config.get<string>('FILES_SIGNING_SECRET') ||
      config.get<string>('JWT_ACCESS_SECRET') ||
      'dev-files-secret';
    const port = config.get<string>('PORT') ?? '5000';
    this.base = (
      config.get<string>('API_PUBLIC_URL') || `http://localhost:${port}/api`
    ).replace(/\/$/, '');
  }

  /** Absolute signed URL of a protected file for one user. */
  signedUrl(
    kind: FileKind,
    id: number,
    userId: number,
    nowMs = Date.now(),
  ): string {
    const exp = expiryFor(nowMs);
    const sig = signature(this.secret, kind, id, userId, exp);
    return `${this.base}/files/${kind}/${id}?u=${userId}&exp=${exp}&sig=${sig}`;
  }

  /** Signature query for every HLS file of one video (relative URIs reuse it). */
  hlsQuery(videoId: number, userId: number, nowMs = Date.now()): string {
    const exp = expiryFor(nowMs);
    const sig = signature(this.secret, 'lesson-hls', videoId, userId, exp);
    return `u=${userId}&exp=${exp}&sig=${sig}`;
  }

  hlsUrl(videoId: number, userId: number, file: string): string {
    return `${this.base}/files/hls/${videoId}/${file}?${this.hlsQuery(videoId, userId)}`;
  }

  /**
   * Turns a LessonVideo row into its public shape for one user: signed HLS
   * master, poster and MP4 fallback URLs; storage locations are removed.
   */
  private publicVideo(
    obj: Record<string, unknown>,
    userId: number | undefined,
  ) {
    const id = obj.id as number;
    const ready = obj.status === 'READY';
    const ref = parseRef(obj.hlsPrefix as string | null);
    if (ref) {
      // Cloudinary streams the video itself (see CloudinaryService.uploadVideo).
      const show = !!userId && this.cloudinary.enabled;
      obj.hlsUrl = show && ready ? this.cloudinary.hlsUrl(ref) : null;
      obj.posterUrl =
        show && obj.hasPoster ? this.cloudinary.posterUrl(ref) : null;
      obj.mp4FallbackUrl = show && ready ? this.cloudinary.mp4Url(ref) : null;
    } else {
      const sign = (file: string) =>
        userId ? this.hlsUrl(id, userId, file) : null;
      obj.hlsUrl = ready && obj.hlsPrefix ? sign('master.m3u8') : null;
      obj.posterUrl =
        obj.hasPoster && obj.hlsPrefix ? sign('poster.jpg') : null;
      obj.mp4FallbackUrl = ready && obj.mp4Url ? sign('source.mp4') : null;
    }
    obj.qualities =
      typeof obj.renditions === 'string' && obj.renditions
        ? obj.renditions.split(',').map(Number)
        : [];
    for (const key of [
      'sourceUrl',
      'mp4Url',
      'hlsPrefix',
      'renditions',
      'hasPoster',
    ])
      delete obj[key];
  }

  verify(
    kind: FileKind,
    id: number,
    userId: number,
    exp: number,
    sig: string,
  ): boolean {
    return verifySignature(this.secret, kind, id, userId, exp, sig);
  }

  /**
   * Rewrites protected file URLs in an API response for `userId`:
   * `{ id, url }` objects stored under lessons/submissions and `{ id, videoUrl }`
   * lessons with an uploaded video get signed URLs; without a user they are
   * blanked. Public files (avatars, covers) and YouTube links are untouched.
   */
  signResponse(data: unknown, userId: number | undefined): void {
    const seen = new Set<object>();
    const walk = (value: unknown) => {
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      if (value instanceof Date || Buffer.isBuffer(value)) return;
      seen.add(value);
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      const obj = value as Record<string, unknown>;
      if (
        'hlsPrefix' in obj &&
        'lessonId' in obj &&
        typeof obj.status === 'string'
      ) {
        this.publicVideo(obj, userId);
        return;
      }
      const id = typeof obj.id === 'number' ? obj.id : undefined;
      if (typeof obj.url === 'string') {
        const folder = protectedFolder(obj.url);
        if (folder === 'lessons' || folder === 'submissions') {
          const kind: FileKind =
            folder === 'lessons' ? 'lesson-file' : 'submission-file';
          obj.url =
            id !== undefined && userId
              ? this.signedUrl(kind, id, userId)
              : null;
        }
      }
      if (
        typeof obj.videoUrl === 'string' &&
        protectedFolder(obj.videoUrl) === 'videos'
      ) {
        obj.videoUrl =
          id !== undefined && userId
            ? this.signedUrl('lesson-video', id, userId)
            : null;
      }
      Object.values(obj).forEach(walk);
    };
    walk(data);
  }

  /** Loads the file and checks that `userId` may read it. */
  async authorize(
    kind: FileKind,
    id: number,
    userId: number,
  ): Promise<ResolvedFile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, blocked: true },
    });
    if (!user || user.blocked) throw new UnauthorizedException('Unauthorized');
    const isAdmin = user.role === 'ADMIN';

    const isStaff = async (courseId: number) =>
      can(await getCourseRole(this.prisma, courseId, user), 'view');
    const canSeeCourse = async (courseId: number) => {
      if (isAdmin || (await isStaff(courseId))) return true;
      const enrollment = await this.prisma.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId } },
        select: { status: true },
      });
      return enrollment?.status === 'ACTIVE';
    };
    const courseSelect = {
      section: {
        select: { course: { select: { id: true, teacherId: true } } },
      },
    } as const;

    if (kind === 'lesson-file') {
      const f = await this.prisma.lessonFile.findUnique({
        where: { id },
        include: { lesson: { select: courseSelect } },
      });
      if (!f || protectedFolder(f.url) !== 'lessons')
        throw new NotFoundException('File not found');
      const c = f.lesson.section.course;
      if (!(await canSeeCourse(c.id)))
        throw new ForbiddenException('Access denied');
      return { url: f.url, name: f.name, mimeType: f.mimeType };
    }

    if (kind === 'lesson-video') {
      const l = await this.prisma.lesson.findUnique({
        where: { id },
        select: { videoUrl: true, ...courseSelect },
      });
      if (!l?.videoUrl || protectedFolder(l.videoUrl) !== 'videos') {
        throw new NotFoundException('File not found');
      }
      const c = l.section.course;
      if (!(await canSeeCourse(c.id)))
        throw new ForbiddenException('Access denied');
      const ext =
        /\.(mp4|webm)(?:$|\?)/i.exec(l.videoUrl)?.[1]?.toLowerCase() ?? 'mp4';
      return {
        url: l.videoUrl,
        name: `lesson-${id}.${ext}`,
        mimeType: VIDEO_TYPES[ext] ?? 'video/mp4',
      };
    }

    const sf = await this.prisma.submissionFile.findUnique({
      where: { id },
      include: {
        submission: {
          select: {
            userId: true,
            assignment: { select: { lesson: { select: courseSelect } } },
          },
        },
      },
    });
    if (!sf || protectedFolder(sf.url) !== 'submissions')
      throw new NotFoundException('File not found');
    const c = sf.submission.assignment.lesson.section.course;
    if (!isAdmin && sf.submission.userId !== userId && !(await isStaff(c.id))) {
      throw new ForbiddenException('Access denied');
    }
    return { url: sf.url, name: sf.name, mimeType: sf.mimeType };
  }
}
