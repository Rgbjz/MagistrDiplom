/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- loose SDK/Prisma mocks */
import {
  BadGatewayException,
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { v2 as sdk } from 'cloudinary';
import {
  formatRef,
  parseRef,
  refFolder,
  resourceTypeFor,
} from './cloudinary-ref';
import { CloudinaryService } from './cloudinary.service';
import { StorageService } from './storage.service';
import { protectedFolder } from '../files/file-urls';
import { FilesService } from '../files/files.service';
import { VideoFilesService } from '../videos/video-files.service';
import { TranscodeService } from '../videos/transcode.service';
import { VideosService } from '../videos/videos.service';

// Only the network calls are mocked; URL building and signing are real.
jest.mock('cloudinary', () => {
  const actual = jest.requireActual('cloudinary');
  Object.assign(actual.v2.uploader, {
    upload_stream: jest.fn(),
    upload_large: jest.fn(),
    explicit: jest.fn().mockResolvedValue({}),
    destroy: jest.fn().mockResolvedValue({ result: 'ok' }),
  });
  return actual;
});

const uploader = sdk.uploader as unknown as Record<string, jest.Mock>;
const CLOUD = 'cloudinary://key123:secret456@demo-cloud';
const config = (values: Record<string, string> = {}) =>
  ({ get: (k: string) => values[k] }) as any;
const file = (name: string, mimetype: string, size = 16) =>
  ({
    originalname: name,
    mimetype,
    size,
    // PNG magic bytes so avatar validation passes.
    buffer: Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(Math.max(0, size - 8)),
    ]),
  }) as Express.Multer.File;

/** upload_stream mock: answers with `result`, or fails with `error`. */
function answerUploads(result: Record<string, unknown> | ((o: any) => any)) {
  uploader.upload_stream.mockImplementation((opts: any, cb: any) => ({
    end: () =>
      typeof result === 'function'
        ? cb(undefined, result(opts))
        : result.error
          ? cb(result.error)
          : cb(undefined, result),
  }));
}

beforeEach(() => jest.clearAllMocks());

describe('cloudinary references', () => {
  it('round-trips and rejects foreign or unsafe values', () => {
    const ref = {
      resourceType: 'raw' as const,
      type: 'authenticated' as const,
      publicId: 'lms/lessons/lessons-1-ab.pdf',
    };
    const s = formatRef(ref);
    expect(s).toBe(
      'cloudinary://raw/authenticated/lms/lessons/lessons-1-ab.pdf',
    );
    expect(parseRef(s)).toEqual(ref);
    expect(refFolder(ref)).toBe('lessons');
    expect(parseRef('cloudinary://raw/private/x')).toBeNull();
    expect(parseRef('cloudinary://raw/upload/lms/../x')).toBeNull();
    expect(parseRef('/public/lessons/a.pdf')).toBeNull();
  });

  it('stores documents as raw, images and videos natively', () => {
    expect(resourceTypeFor('image/png')).toBe('image');
    expect(resourceTypeFor('image/jpeg')).toBe('image');
    expect(resourceTypeFor('video/mp4')).toBe('video');
    expect(resourceTypeFor('application/pdf')).toBe('raw');
    expect(resourceTypeFor('application/zip')).toBe('raw');
    expect(resourceTypeFor('image/svg+xml')).toBe('raw');
  });

  it('treats lesson and submission references as protected', () => {
    expect(
      protectedFolder('cloudinary://raw/authenticated/lms/lessons/a.pdf'),
    ).toBe('lessons');
    expect(
      protectedFolder('cloudinary://image/authenticated/lms/submissions/b'),
    ).toBe('submissions');
    expect(protectedFolder('cloudinary://image/upload/lms/avatars/c')).toBe(
      null,
    );
  });
});

describe('CloudinaryService', () => {
  it('is off without CLOUDINARY_URL and refuses a malformed one', () => {
    expect(new CloudinaryService(config()).enabled).toBe(false);
    expect(
      () => new CloudinaryService(config({ CLOUDINARY_URL: 'x' })),
    ).toThrow(/CLOUDINARY_URL/);
    const c = new CloudinaryService(config({ CLOUDINARY_URL: CLOUD }));
    expect(c.enabled).toBe(true);
    expect(c.cloudName).toBe('demo-cloud');
    expect(c.maxFileBytes).toBe(10 * 1024 * 1024);
  });

  it('signs private delivery URLs, not public ones', () => {
    const c = new CloudinaryService(config({ CLOUDINARY_URL: CLOUD }));
    const priv = c.url({
      resourceType: 'raw',
      type: 'authenticated',
      publicId: 'lms/lessons/a.pdf',
    });
    expect(priv).toMatch(
      /^https:\/\/res\.cloudinary\.com\/demo-cloud\/raw\/authenticated\/s--[\w-]{8}--\/.*lms\/lessons\/a\.pdf/,
    );
    const video = {
      resourceType: 'video' as const,
      type: 'upload' as const,
      publicId: 'lms/videos/1-abc',
    };
    expect(c.hlsUrl(video)).toMatch(
      /\/demo-cloud\/video\/upload\/sp_hd\/.*lms\/videos\/1-abc\.m3u8/,
    );
    expect(c.hlsUrl(video)).not.toContain('s--');
    expect(c.posterUrl(video)).toMatch(/so_auto\/.*1-abc\.jpg/);
  });

  it('reads references back from public URLs of our own cloud only', () => {
    const c = new CloudinaryService(config({ CLOUDINARY_URL: CLOUD }));
    expect(
      c.refFromUrl(
        'https://res.cloudinary.com/demo-cloud/image/upload/v1712/lms/avatars/avatars-1-ab.png',
      ),
    ).toEqual({
      resourceType: 'image',
      type: 'upload',
      publicId: 'lms/avatars/avatars-1-ab',
    });
    expect(
      c.refFromUrl(
        'https://res.cloudinary.com/other/image/upload/v1/lms/avatars/a.png',
      ),
    ).toBeNull();
  });

  it('maps upload errors to readable HTTP errors', async () => {
    const c = new CloudinaryService(config({ CLOUDINARY_URL: CLOUD }));
    const up = () =>
      c.uploadBuffer(Buffer.alloc(10), {
        publicId: 'lms/lessons/a.pdf',
        resourceType: 'raw',
        type: 'authenticated',
      });
    answerUploads({
      error: {
        message: 'File size too large. Got 12000000. Maximum is 10485760.',
        http_code: 400,
      },
    });
    await expect(up()).rejects.toBeInstanceOf(PayloadTooLargeException);
    answerUploads({ error: { message: 'Invalid image file', http_code: 400 } });
    await expect(up()).rejects.toBeInstanceOf(BadRequestException);
    answerUploads({ error: { message: 'ECONNRESET' } });
    await expect(up()).rejects.toBeInstanceOf(BadGatewayException);
  });
});

describe('StorageService on Cloudinary', () => {
  const storage = () => new StorageService(config({ CLOUDINARY_URL: CLOUD }));

  it('uploads private files as authenticated and returns a reference', async () => {
    answerUploads((o) => ({ public_id: o.public_id, secure_url: 'unused' }));
    const ref = await storage().save(
      file('Лекція 1.pdf', 'application/pdf'),
      'lessons',
    );
    const opts = uploader.upload_stream.mock.calls[0][0];
    expect(opts).toMatchObject({ resource_type: 'raw', type: 'authenticated' });
    expect(opts.public_id).toMatch(
      /^lms\/lessons\/lessons-\d+-[a-f0-9]{8}\.pdf$/,
    );
    expect(ref).toBe(`cloudinary://raw/authenticated/${opts.public_id}`);
    expect(storage().isStored(ref)).toBe(true);
  });

  it('keeps avatars public and returns their https URL', async () => {
    answerUploads((o) => ({
      public_id: o.public_id,
      secure_url: `https://res.cloudinary.com/demo-cloud/image/upload/v1/${o.public_id}.png`,
    }));
    const url = await storage().save(file('me.png', 'image/png'), 'avatars');
    const opts = uploader.upload_stream.mock.calls[0][0];
    expect(opts).toMatchObject({ resource_type: 'image', type: 'upload' });
    expect(opts.public_id).not.toMatch(/\.png$/);
    expect(url).toMatch(/^https:\/\/res\.cloudinary\.com\/demo-cloud\//);
    expect(protectedFolder(url)).toBeNull();
  });

  it('rejects files over the free-plan limit before uploading', async () => {
    await expect(
      storage().save(
        file('big.zip', 'application/zip', 11 * 1024 * 1024),
        'submissions',
      ),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(uploader.upload_stream).not.toHaveBeenCalled();
  });

  it('deletes by reference or public URL', async () => {
    await storage().remove('cloudinary://raw/authenticated/lms/lessons/a.pdf');
    expect(uploader.destroy).toHaveBeenLastCalledWith('lms/lessons/a.pdf', {
      resource_type: 'raw',
      type: 'authenticated',
      invalidate: true,
    });
    await storage().remove(
      'https://res.cloudinary.com/demo-cloud/image/upload/v9/lms/courses/c-1.jpg',
    );
    expect(uploader.destroy).toHaveBeenLastCalledWith('lms/courses/c-1', {
      resource_type: 'image',
      type: 'upload',
      invalidate: true,
    });
  });

  it('changes nothing without CLOUDINARY_URL', async () => {
    const local = new StorageService(config());
    await local.remove('cloudinary://raw/authenticated/lms/lessons/a.pdf');
    expect(uploader.destroy).not.toHaveBeenCalled();
    expect(local.isStored('https://example.com/a.png')).toBe(false);
  });
});

describe('FilesService with Cloudinary videos', () => {
  const files = new FilesService(
    {} as any,
    config({
      CLOUDINARY_URL: CLOUD,
      FILES_SIGNING_SECRET: 's',
      API_PUBLIC_URL: 'http://api/api',
    }),
  );
  const row = () => ({
    id: 3,
    lessonId: 1,
    status: 'READY',
    hlsPrefix: 'cloudinary://video/upload/lms/videos/3-abc',
    mp4Url: 'cloudinary://video/upload/lms/videos/3-abc',
    sourceUrl: null,
    renditions: '720,540,360',
    hasPoster: true,
  });

  it('gives a signed-in viewer Cloudinary stream URLs', () => {
    const v: any = row();
    files.signResponse(v, 9);
    expect(v.hlsUrl).toMatch(/\/video\/upload\/sp_hd\/.*3-abc\.m3u8/);
    expect(v.posterUrl).toMatch(/\.jpg/);
    expect(v.mp4FallbackUrl).toMatch(/3-abc\.mp4/);
    expect(v.qualities).toEqual([720, 540, 360]);
    expect(v).not.toHaveProperty('hlsPrefix');
  });

  it('exposes nothing to guests', () => {
    const v: any = row();
    files.signResponse(v, undefined);
    expect(v.hlsUrl).toBeNull();
    expect(v.posterUrl).toBeNull();
  });

  it('signs lesson files stored on Cloudinary through the API', () => {
    const f: any = {
      id: 5,
      url: 'cloudinary://raw/authenticated/lms/lessons/a.pdf',
    };
    files.signResponse(f, 9);
    expect(f.url).toMatch(/^http:\/\/api\/api\/files\/lesson-file\/5\?u=9&/);
  });
});

describe('Videos on Cloudinary', () => {
  it('prefers Cloudinary over Blob for uploads', () => {
    const both = new VideoFilesService(
      config({
        CLOUDINARY_URL: CLOUD,
        BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_a_b',
      }),
    );
    expect(both.cloudinaryMode).toBe(true);
    expect(both.blobMode).toBe(false);
    const blob = new VideoFilesService(
      config({ BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_a_b' }),
    );
    expect(blob.cloudinaryMode).toBe(false);
    expect(blob.blobMode).toBe(true);
  });

  it('polls the HLS playlist until Cloudinary has built it', async () => {
    const vf = new VideoFilesService(config({ CLOUDINARY_URL: CLOUD }));
    vf.sleep = jest.fn().mockResolvedValue(undefined);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 423 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response);
    const ref = {
      resourceType: 'video' as const,
      type: 'upload' as const,
      publicId: 'lms/videos/1-a',
    };
    await vf.waitForCloudinaryHls(ref);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0] as string).toContain('.m3u8');
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as Response);
    await expect(vf.waitForCloudinaryHls(ref, undefined, 0)).rejects.toThrow(
      /did not finish/,
    );
    fetchMock.mockRestore();
  });

  it('limits video size to the Cloudinary plan', async () => {
    const prisma: any = {
      lesson: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 4, section: { courseId: 1 } }),
      },
      course: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, teacherId: 7 }),
      },
      courseStaff: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const uploads = {
      create: jest
        .fn()
        .mockResolvedValue({ uploadId: 'a'.repeat(32), totalChunks: 1 }),
    };
    const svc = new VideosService(
      prisma,
      new VideoFilesService(config({ CLOUDINARY_URL: CLOUD })),
      uploads as any,
      {} as any,
      config(),
    );
    const teacher = { id: 7, role: 'TEACHER' } as any;
    await expect(
      svc.initUpload(4, teacher, {
        size: 150 * 1024 * 1024,
        mime: 'video/mp4',
        name: 'a',
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    await expect(
      svc.initUpload(4, teacher, { size: 10, mime: 'video/mp4', name: 'a' }),
    ).resolves.toMatchObject({ mode: 'chunked' });
  });

  describe('TranscodeService (Cloudinary mode, no ffmpeg)', () => {
    const PREFIX = 'cloudinary://video/upload/lms/videos/1-abc';
    const make = (wait: jest.Mock) => {
      const prisma: any = {
        lessonVideo: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce({
              id: 1,
              sourceUrl: '/private/video-src/a.mp4',
              mp4Url: null,
              hlsPrefix: null,
              status: 'PROCESSING',
            })
            // after the upload the record points at Cloudinary
            .mockResolvedValue({
              id: 1,
              sourceUrl: PREFIX,
              mp4Url: null,
              hlsPrefix: null,
              status: 'PROCESSING',
            }),
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({}),
        },
      };
      const files: any = {
        cloudinaryMode: true,
        cloudinary: { requestHls: jest.fn() },
        workDir: jest.fn(async () => mkdtemp(join(tmpdir(), 'lms-cl-'))),
        localCopy: jest.fn().mockResolvedValue('/src.mp4'),
        uploadToCloudinary: jest.fn().mockResolvedValue({
          prefix: PREFIX,
          durationSec: 12.5,
          width: 1280,
          height: 720,
        }),
        waitForCloudinaryHls: wait,
        removeHls: jest.fn(),
        removeFile: jest.fn(),
        removeDir: jest.fn((d: string) =>
          rm(d, { recursive: true, force: true }),
        ),
      };
      const t = new TranscodeService(
        prisma,
        { register: jest.fn() } as any,
        files,
        config(),
      );
      t.run = jest.fn();
      return { t, prisma, files };
    };

    it('uploads, waits for HLS and marks the video READY', async () => {
      const { t, prisma, files } = make(jest.fn().mockResolvedValue(undefined));
      await t.transcode({ videoId: 1, sourceUrl: '/private/video-src/a.mp4' });
      expect(t.run).not.toHaveBeenCalled();
      expect(files.uploadToCloudinary).toHaveBeenCalledWith(1, '/src.mp4');
      expect(prisma.lessonVideo.updateMany).toHaveBeenCalledWith({
        where: { id: 1, sourceUrl: '/private/video-src/a.mp4' },
        data: { sourceUrl: PREFIX },
      });
      expect(files.removeFile).toHaveBeenCalledWith('/private/video-src/a.mp4');
      const last = prisma.lessonVideo.update.mock.calls.at(-1)[0].data;
      expect(last).toMatchObject({
        status: 'READY',
        hlsPrefix: PREFIX,
        mp4Url: PREFIX,
        sourceUrl: null,
        renditions: '720,540,360,270,180',
        hasPoster: true,
        durationSec: 12.5,
      });
    });

    it('marks FAILED when Cloudinary never finishes, keeping the upload', async () => {
      const { t, prisma } = make(
        jest.fn().mockRejectedValue(new Error('Cloudinary did not finish')),
      );
      await t.transcode({ videoId: 1, sourceUrl: '/private/video-src/a.mp4' });
      const last = prisma.lessonVideo.update.mock.calls.at(-1)[0].data;
      expect(last).toMatchObject({ status: 'FAILED' });
      expect(last.error).toMatch(/did not finish/);
    });

    it('a retry of an uploaded video only re-requests the renditions', async () => {
      const { t, files } = make(jest.fn().mockResolvedValue(undefined));
      files.uploadToCloudinary.mockClear();
      const prisma = (t as any).prisma;
      prisma.lessonVideo.findUnique.mockReset().mockResolvedValue({
        id: 1,
        sourceUrl: PREFIX,
        mp4Url: null,
        hlsPrefix: null,
        status: 'PROCESSING',
      });
      await t.transcode({ videoId: 1, sourceUrl: PREFIX });
      expect(files.uploadToCloudinary).not.toHaveBeenCalled();
      expect(files.cloudinary.requestHls).toHaveBeenCalledWith(
        parseRef(PREFIX),
      );
      expect(prisma.lessonVideo.update.mock.calls.at(-1)[0].data).toMatchObject(
        { status: 'READY', hlsPrefix: PREFIX },
      );
    });
  });
});
