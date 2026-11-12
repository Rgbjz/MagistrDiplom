/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- loose Prisma mocks */
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  contentDisposition,
  expiryFor,
  parseRange,
  protectedFolder,
  signature,
  verifySignature,
} from './file-urls';
import { FilesService } from './files.service';
import { isImage } from '../storage/storage.service';

const SECRET = 'test-secret';
const NOW = Date.UTC(2026, 10, 11, 10, 15);

describe('file URL signing', () => {
  it('verifies its own signature within the expiry window', () => {
    const exp = expiryFor(NOW);
    const sig = signature(SECRET, 'lesson-file', 5, 7, exp);
    expect(verifySignature(SECRET, 'lesson-file', 5, 7, exp, sig, NOW)).toBe(
      true,
    );
    expect(exp - NOW / 1000).toBeGreaterThan(3600);
    expect(exp - NOW / 1000).toBeLessThanOrEqual(7200);
  });

  it('rejects another file, user, kind, secret or a tampered signature', () => {
    const exp = expiryFor(NOW);
    const sig = signature(SECRET, 'lesson-file', 5, 7, exp);
    expect(verifySignature(SECRET, 'lesson-file', 6, 7, exp, sig, NOW)).toBe(
      false,
    );
    expect(verifySignature(SECRET, 'lesson-file', 5, 8, exp, sig, NOW)).toBe(
      false,
    );
    expect(
      verifySignature(SECRET, 'submission-file', 5, 7, exp, sig, NOW),
    ).toBe(false);
    expect(verifySignature('other', 'lesson-file', 5, 7, exp, sig, NOW)).toBe(
      false,
    );
    expect(
      verifySignature(
        SECRET,
        'lesson-file',
        5,
        7,
        exp,
        sig.slice(1) + 'A',
        NOW,
      ),
    ).toBe(false);
  });

  it('rejects expired and too far-future links', () => {
    const past = Math.floor(NOW / 1000) - 1;
    expect(
      verifySignature(
        SECRET,
        'lesson-file',
        5,
        7,
        past,
        signature(SECRET, 'lesson-file', 5, 7, past),
        NOW,
      ),
    ).toBe(false);
    const far = Math.floor(NOW / 1000) + 3 * 3600;
    expect(
      verifySignature(
        SECRET,
        'lesson-file',
        5,
        7,
        far,
        signature(SECRET, 'lesson-file', 5, 7, far),
        NOW,
      ),
    ).toBe(false);
  });
});

describe('protectedFolder', () => {
  it('classifies local and blob URLs', () => {
    expect(protectedFolder('/public/lessons/lessons-1-a.pdf')).toBe('lessons');
    expect(protectedFolder('/public/videos/v.mp4')).toBe('videos');
    expect(protectedFolder('/public/submissions/s.zip')).toBe('submissions');
    expect(
      protectedFolder(
        'https://abc.public.blob.vercel-storage.com/submissions/x-AbC.pdf',
      ),
    ).toBe('submissions');
    expect(protectedFolder('/public/avatars/a.png')).toBeNull();
    expect(protectedFolder('https://www.youtube.com/watch?v=x')).toBeNull();
    expect(protectedFolder('/public/lessons/../secret')).toBeNull();
  });
});

describe('parseRange', () => {
  it('handles full, open, suffix and invalid ranges', () => {
    expect(parseRange(undefined, 100)).toBeNull();
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=50-500', 100)).toEqual({ start: 50, end: 99 });
    expect(parseRange('bytes=100-', 100)).toBe('invalid');
    expect(parseRange('bytes=5-1', 100)).toBe('invalid');
    expect(parseRange('items=0-1', 100)).toBe('invalid');
  });
});

describe('contentDisposition', () => {
  it('inlines media and encodes Cyrillic names', () => {
    expect(contentDisposition('урок.pdf', 'application/pdf')).toMatch(
      /^inline; filename="____\.pdf"; filename\*=UTF-8''%D1%83/,
    );
    expect(contentDisposition('a.zip', 'application/zip')).toMatch(
      /^attachment;/,
    );
  });
});

describe('isImage', () => {
  it('accepts real image headers and rejects others', () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(8),
    ]);
    expect(isImage(png)).toBe(true);
    expect(
      isImage(
        Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(10)]),
      ),
    ).toBe(true);
    expect(isImage(Buffer.from('<script>alert(1)</script>'))).toBe(false);
  });
});

describe('FilesService', () => {
  let prisma: any;
  let service: FilesService;
  const config = {
    get: (k: string) =>
      ({
        FILES_SIGNING_SECRET: SECRET,
        API_PUBLIC_URL: 'https://api.test/api',
      })[k],
  } as unknown as ConfigService;
  const course = { section: { course: { id: 1, teacherId: 10 } } };

  beforeEach(() => {
    prisma = {
      course: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, teacherId: 10 }),
      },
      courseStaff: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 20, role: 'STUDENT', blocked: false }),
      },
      enrollment: {
        findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      },
      lessonFile: {
        findUnique: jest.fn().mockResolvedValue({
          url: '/public/lessons/a.pdf',
          name: 'a.pdf',
          mimeType: 'application/pdf',
          lesson: course,
        }),
      },
      lesson: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ videoUrl: '/public/videos/v.webm', ...course }),
      },
      submissionFile: {
        findUnique: jest.fn().mockResolvedValue({
          url: '/public/submissions/s.zip',
          name: 's.zip',
          mimeType: 'application/zip',
          submission: { userId: 20, assignment: { lesson: course } },
        }),
      },
    };
    service = new FilesService(prisma, config);
  });

  it('builds absolute signed URLs that verify', () => {
    const url = new URL(service.signedUrl('lesson-file', 3, 20));
    expect(url.origin + url.pathname).toBe(
      'https://api.test/api/files/lesson-file/3',
    );
    const q = url.searchParams;
    expect(
      service.verify('lesson-file', 3, 20, Number(q.get('exp')), q.get('sig')!),
    ).toBe(true);
  });

  it('lets an ACTIVE student read lesson files and videos', async () => {
    await expect(
      service.authorize('lesson-file', 1, 20),
    ).resolves.toMatchObject({ name: 'a.pdf' });
    await expect(
      service.authorize('lesson-video', 1, 20),
    ).resolves.toMatchObject({ mimeType: 'video/webm' });
  });

  it('denies a student without an ACTIVE enrollment', async () => {
    prisma.enrollment.findUnique.mockResolvedValue({ status: 'PENDING' });
    await expect(
      service.authorize('lesson-file', 1, 20),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets the course teacher and admins in without enrollment', async () => {
    prisma.enrollment.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({
      id: 10,
      role: 'TEACHER',
      blocked: false,
    });
    await expect(service.authorize('lesson-file', 1, 10)).resolves.toBeTruthy();
    prisma.user.findUnique.mockResolvedValue({
      id: 99,
      role: 'ADMIN',
      blocked: false,
    });
    await expect(
      service.authorize('submission-file', 1, 99),
    ).resolves.toBeTruthy();
  });

  it('keeps submissions private to the author and the teacher', async () => {
    await expect(
      service.authorize('submission-file', 1, 20),
    ).resolves.toBeTruthy();
    prisma.user.findUnique.mockResolvedValue({
      id: 21,
      role: 'STUDENT',
      blocked: false,
    });
    await expect(
      service.authorize('submission-file', 1, 21),
    ).rejects.toBeInstanceOf(ForbiddenException);
    prisma.user.findUnique.mockResolvedValue({
      id: 11,
      role: 'TEACHER',
      blocked: false,
    });
    await expect(
      service.authorize('submission-file', 1, 11),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects blocked users, unknown files and non-protected URLs', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 20,
      role: 'STUDENT',
      blocked: true,
    });
    await expect(
      service.authorize('lesson-file', 1, 20),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    prisma.user.findUnique.mockResolvedValue({
      id: 20,
      role: 'STUDENT',
      blocked: false,
    });
    prisma.lessonFile.findUnique.mockResolvedValue(null);
    await expect(
      service.authorize('lesson-file', 1, 20),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.lesson.findUnique.mockResolvedValue({
      videoUrl: 'https://youtu.be/x',
      ...course,
    });
    await expect(
      service.authorize('lesson-video', 1, 20),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('signs protected URLs in responses and leaves public ones', () => {
    const data = {
      lesson: {
        id: 4,
        videoUrl: '/public/videos/v.mp4',
        files: [{ id: 9, url: '/public/lessons/a.pdf' }],
      },
      other: {
        id: 5,
        videoUrl: 'https://youtu.be/x',
        avatarUrl: '/public/avatars/x.png',
      },
      sub: {
        files: [
          {
            id: 2,
            url: 'https://x.public.blob.vercel-storage.com/submissions/s.pdf',
          },
        ],
      },
    };
    service.signResponse(data, 20);
    expect(data.lesson.videoUrl).toMatch(
      /^https:\/\/api\.test\/api\/files\/lesson-video\/4\?u=20&exp=\d+&sig=/,
    );
    expect(data.lesson.files[0].url).toMatch(/\/files\/lesson-file\/9\?/);
    expect(data.sub.files[0].url).toMatch(/\/files\/submission-file\/2\?/);
    expect(data.other.videoUrl).toBe('https://youtu.be/x');
    expect(data.other.avatarUrl).toBe('/public/avatars/x.png');
  });

  it('blanks protected URLs when there is no user', () => {
    const data = { files: [{ id: 9, url: '/public/lessons/a.pdf' }] };
    service.signResponse(data, undefined);
    expect(data.files[0].url).toBeNull();
  });
});
