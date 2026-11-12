/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- loose Prisma mocks */
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import {
  hlsArgs,
  looksLikeVideo,
  masterPlaylist,
  parseSourceInfo,
  progressMicros,
  renditionsFor,
  signPlaylist,
} from './hls';
import { TranscodeService, spawnRunner } from './transcode.service';
import { CHUNK_SIZE, UploadsService } from './uploads.service';
import { VideoFilesService } from './video-files.service';
import { VideosService } from './videos.service';
import { FilesService } from '../files/files.service';

const FFMPEG_STDERR = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'in.mp4':
  Duration: 00:01:02.50, start: 0.000000, bitrate: 1500 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 1400 kb/s, 30 fps
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s
At least one output file must be specified`;

const config = (values: Record<string, string> = {}) =>
  ({ get: (k: string) => values[k] }) as any;

describe('hls helpers', () => {
  it('parses duration, size and audio from ffmpeg -i output', () => {
    expect(parseSourceInfo(FFMPEG_STDERR)).toEqual({
      durationSec: 62.5,
      width: 1920,
      height: 1080,
      hasAudio: true,
    });
    expect(parseSourceInfo('garbage')).toBeNull();
  });

  it('swaps dimensions for rotated phone videos', () => {
    const info = parseSourceInfo(
      FFMPEG_STDERR.replace('1920x1080', '1920x1080 rotate: 90'),
    );
    expect(info).toMatchObject({ width: 1080, height: 1920 });
  });

  it('picks 720p + 360p for HD and one rendition for small sources', () => {
    expect(
      renditionsFor({ width: 1920, height: 1080 }).map((r) => r.height),
    ).toEqual([720, 360]);
    expect(renditionsFor({ width: 1920, height: 1080 })[0].width).toBe(1280);
    expect(
      renditionsFor({ width: 320, height: 240 }).map((r) => r.height),
    ).toEqual([240]);
    expect(renditionsFor({ width: 641, height: 359 })[0].width % 2).toBe(0);
  });

  it('builds ffmpeg args without a shell and with aligned keyframes', () => {
    const args = hlsArgs(
      '/tmp/in.mp4',
      '/tmp/out',
      renditionsFor({ width: 1280, height: 720 })[0],
      false,
    );
    expect(args).toEqual(
      expect.arrayContaining([
        '-i',
        '/tmp/in.mp4',
        '-hls_playlist_type',
        'vod',
      ]),
    );
    expect(args).toContain('/tmp/out/720p.m3u8');
    expect(args).toContain('expr:gte(t,n_forced*6)');
    expect(args).not.toContain('0:a:0');
    expect(args.join(' ')).not.toMatch(/[;&|`$]/);
  });

  it('reads -progress output', () => {
    expect(progressMicros('out_time_us=1500000')).toBe(1500000);
    expect(progressMicros('frame=12')).toBeNull();
  });

  it('writes a master playlist and signs every URI in it', () => {
    const master = masterPlaylist(renditionsFor({ width: 1280, height: 720 }));
    expect(master).toContain('RESOLUTION=1280x720');
    const signed = signPlaylist(master, 'u=1&exp=2&sig=abc');
    expect(signed).toContain('720p.m3u8?u=1&exp=2&sig=abc');
    expect(signed).toContain('360p.m3u8?u=1&exp=2&sig=abc');
    const variant = '#EXTM3U\n#EXTINF:6.0,\n720p_000.ts\n#EXT-X-ENDLIST\n';
    expect(signPlaylist(variant, 'q=1')).toContain('720p_000.ts?q=1');
    // Unknown URIs (e.g. injected absolute URLs) are left untouched.
    expect(signPlaylist('https://evil/x.ts\n', 'q=1')).toBe(
      'https://evil/x.ts\n',
    );
  });

  it('recognises MP4/MOV and WebM headers', () => {
    expect(
      looksLikeVideo(Buffer.from('000000206674797069736f6d00000200', 'hex')),
    ).toBe(true);
    expect(
      looksLikeVideo(Buffer.from('1a45dfa3a3428286810142f7810142f2', 'hex')),
    ).toBe(true);
    expect(looksLikeVideo(Buffer.from('<html><script>x</script>'))).toBe(false);
  });
});

describe('FilesService HLS signatures', () => {
  const files = new FilesService(
    {} as any,
    config({ FILES_SIGNING_SECRET: 's', API_PUBLIC_URL: 'http://api/api' }),
  );

  it('signs a query that verifies only for the same video and user', () => {
    const q = new URLSearchParams(files.hlsQuery(5, 9));
    const exp = Number(q.get('exp'));
    const sig = q.get('sig')!;
    expect(files.verify('lesson-hls', 5, 9, exp, sig)).toBe(true);
    expect(files.verify('lesson-hls', 6, 9, exp, sig)).toBe(false);
    expect(files.verify('lesson-hls', 5, 10, exp, sig)).toBe(false);
    expect(files.verify('lesson-video', 5, 9, exp, sig)).toBe(false);
  });

  it('replaces a LessonVideo row with signed public URLs', () => {
    const body: any = {
      lesson: {
        video: {
          id: 3,
          lessonId: 1,
          status: 'READY',
          progress: 100,
          hlsPrefix: 'hls/3-x',
          sourceUrl: '/private/video-src/a.mp4',
          mp4Url: '/private/video-src/a.mp4',
          renditions: '720,360',
          hasPoster: true,
          durationSec: 10,
        },
      },
    };
    files.signResponse(body, 9);
    const v = body.lesson.video;
    expect(v.hlsUrl).toMatch(
      /^http:\/\/api\/api\/files\/hls\/3\/master\.m3u8\?u=9&exp=\d+&sig=/,
    );
    expect(v.posterUrl).toContain('/files/hls/3/poster.jpg?');
    expect(v.mp4FallbackUrl).toContain('/files/hls/3/source.mp4?');
    expect(v.qualities).toEqual([720, 360]);
    expect(v).not.toHaveProperty('sourceUrl');
    expect(v).not.toHaveProperty('hlsPrefix');
  });

  it('exposes no URLs while processing or without a user', () => {
    const body: any = {
      id: 3,
      lessonId: 1,
      status: 'PROCESSING',
      hlsPrefix: null,
      mp4Url: null,
      hasPoster: false,
    };
    files.signResponse(body, 9);
    expect(body.hlsUrl).toBeNull();
    const anon: any = {
      id: 3,
      lessonId: 1,
      status: 'READY',
      hlsPrefix: 'hls/3-x',
      mp4Url: null,
      hasPoster: true,
    };
    files.signResponse(anon, undefined);
    expect(anon.hlsUrl).toBeNull();
    expect(anon.posterUrl).toBeNull();
  });
});

describe('UploadsService (chunked, resumable)', () => {
  let root: string;
  let uploads: UploadsService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'lms-up-'));
    uploads = new UploadsService({
      dir: (...p: string[]) => join(root, ...p),
    } as any);
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  const mp4 = (size: number) => {
    const buf = Buffer.alloc(size, 7);
    Buffer.from('000000206674797069736f6d', 'hex').copy(buf, 0);
    return buf;
  };

  it('stores chunks, reports them for resume and assembles the file', async () => {
    const data = mp4(CHUNK_SIZE + 1000);
    const s = await uploads.create(1, 7, {
      size: data.length,
      mime: 'video/mp4',
      name: 'a.mp4',
    });
    expect(s.totalChunks).toBe(2);
    await uploads.writeChunk(s, 1, Readable.from([data.subarray(CHUNK_SIZE)]));
    expect(await uploads.received(s)).toEqual([1]);
    await expect(uploads.assemble(s)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await uploads.writeChunk(
      s,
      0,
      Readable.from([data.subarray(0, CHUNK_SIZE)]),
    );
    expect(await uploads.received(s)).toEqual([0, 1]);
    const url = await uploads.assemble(s);
    expect(url).toMatch(/^\/private\/video-src\/lesson-1-\d+-[a-f0-9]+\.mp4$/);
    const stored = await readFile(
      join(root, 'video-src', url.split('/').pop()!),
    );
    expect(stored.equals(data)).toBe(true);
  });

  it('rejects chunks of the wrong length and foreign users', async () => {
    const s = await uploads.create(1, 7, {
      size: 100,
      mime: 'video/mp4',
      name: 'a.mp4',
    });
    await expect(
      uploads.writeChunk(s, 0, Readable.from([Buffer.alloc(150)])),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      uploads.writeChunk(s, 0, Readable.from([Buffer.alloc(50)])),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      uploads.writeChunk(s, 3, Readable.from([Buffer.alloc(100)])),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(uploads.get(s.uploadId, 8)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects files that are not videos once assembled', async () => {
    const s = await uploads.create(1, 7, {
      size: 64,
      mime: 'video/mp4',
      name: 'x.mp4',
    });
    await uploads.writeChunk(s, 0, Readable.from([Buffer.alloc(64, 1)]));
    await expect(uploads.assemble(s)).rejects.toThrow('File is not a video');
  });

  it('validates type and size up front', async () => {
    await expect(
      uploads.create(1, 7, { size: 10, mime: 'text/html', name: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      uploads.create(1, 7, {
        size: 3 * 1024 ** 3,
        mime: 'video/mp4',
        name: 'x',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('VideosService permissions', () => {
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
  const svc = (blob = false) =>
    new VideosService(
      prisma,
      { blobMode: blob } as any,
      uploads as any,
      {} as any,
      config(),
    );

  it('lets the course owner start an upload (chunked or Blob)', async () => {
    await expect(
      svc().initUpload(4, { id: 7, role: 'TEACHER' } as any, {
        size: 10,
        mime: 'video/mp4',
        name: 'a',
      }),
    ).resolves.toMatchObject({ mode: 'chunked' });
    await expect(
      svc(true).initUpload(4, { id: 7, role: 'TEACHER' } as any, {
        size: 10,
        mime: 'video/webm',
        name: 'a',
      }),
    ).resolves.toMatchObject({
      mode: 'blob',
      handleUploadUrl: '/lessons/4/video/upload-token',
    });
  });

  it('refuses users without content rights (upload token / init)', async () => {
    await expect(
      svc().initUpload(4, { id: 8, role: 'STUDENT' } as any, {
        size: 10,
        mime: 'video/mp4',
        name: 'a',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    prisma.courseStaff.findUnique.mockResolvedValueOnce({ role: 'ASSISTANT' });
    await expect(
      svc().assertCanEdit(4, { id: 9, role: 'TEACHER' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('only accepts Blob URLs from our own store and source folder', () => {
    const s = new VideosService(
      prisma,
      { blobStoreId: 'abc123' } as any,
      uploads as any,
      {} as any,
      config(),
    );
    expect(
      s.isOwnBlobSource(
        'https://abc123.public.blob.vercel-storage.com/video-src/lesson-4-x.mp4',
      ),
    ).toBe(true);
    expect(
      s.isOwnBlobSource(
        'https://other.public.blob.vercel-storage.com/video-src/a.mp4',
      ),
    ).toBe(false);
    expect(
      s.isOwnBlobSource(
        'https://abc123.public.blob.vercel-storage.com/lessons/a.mp4',
      ),
    ).toBe(false);
    expect(
      s.isOwnBlobSource(
        'http://abc123.public.blob.vercel-storage.com/video-src/a.mp4',
      ),
    ).toBe(false);
  });
});

describe('TranscodeService state transitions (mocked ffmpeg)', () => {
  const make = (runner: any) => {
    const prisma: any = {
      lessonVideo: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          sourceUrl: '/private/video-src/a.mp4',
          mp4Url: null,
          hlsPrefix: null,
          status: 'PROCESSING',
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
      },
    };
    const files: any = {
      workDir: jest.fn(async () => mkdtemp(join(tmpdir(), 'lms-tc-'))),
      localCopy: jest.fn().mockResolvedValue('/src.mp4'),
      publishHls: jest.fn().mockResolvedValue('hls/1-abc'),
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
    t.run = runner;
    return { t, prisma, files };
  };

  it('marks READY with renditions and metadata on success', async () => {
    const runner = jest.fn(
      (_cmd: string, args: string[], onLine?: (l: string) => void) => {
        if (args.length === 3)
          return Promise.resolve({ code: 1, stderr: FFMPEG_STDERR });
        onLine?.('out_time_us=31000000');
        return Promise.resolve({ code: 0, stderr: '' });
      },
    );
    const { t, prisma, files } = make(runner);
    await t.transcode({ videoId: 1, sourceUrl: '/private/video-src/a.mp4' });
    expect(runner).toHaveBeenCalledTimes(4); // probe, 720p, 360p, poster
    expect(files.publishHls).toHaveBeenCalled();
    const final = prisma.lessonVideo.update.mock.calls.at(-1)[0];
    expect(final.data).toMatchObject({
      status: 'READY',
      progress: 100,
      hlsPrefix: 'hls/1-abc',
      renditions: '720,360',
      width: 1920,
      height: 1080,
      mp4Url: '/private/video-src/a.mp4',
    });
    expect(prisma.lessonVideo.updateMany).toHaveBeenCalled(); // progress saved
  });

  it('marks FAILED with the error when ffmpeg fails', async () => {
    const runner = jest.fn((_c: string, args: string[]) =>
      Promise.resolve(
        args.length === 3
          ? { code: 1, stderr: FFMPEG_STDERR }
          : { code: 1, stderr: 'Invalid data found' },
      ),
    );
    const { t, prisma, files } = make(runner);
    await t.transcode({ videoId: 1, sourceUrl: '/private/video-src/a.mp4' });
    expect(files.publishHls).not.toHaveBeenCalled();
    const final = prisma.lessonVideo.update.mock.calls.at(-1)[0];
    expect(final.data).toMatchObject({ status: 'FAILED' });
    expect(final.data.error).toContain('Invalid data found');
  });

  it('skips a job whose source was replaced meanwhile', async () => {
    const runner = jest.fn();
    const { t, prisma } = make(runner);
    await t.transcode({ videoId: 1, sourceUrl: '/private/video-src/old.mp4' });
    expect(runner).not.toHaveBeenCalled();
    expect(prisma.lessonVideo.update).not.toHaveBeenCalled();
  });
});

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

(hasFfmpeg ? describe : describe.skip)(
  'TranscodeService with real ffmpeg',
  () => {
    jest.setTimeout(120_000);

    it('turns a short clip into HLS (master, variant, segments, poster)', async () => {
      const work = await mkdtemp(join(tmpdir(), 'lms-it-'));
      const src = join(work, 'clip.mp4');
      execFileSync('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=640x360:rate=24:duration=6',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=6',
        '-shortest',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        src,
      ]);
      const prisma: any = {
        lessonVideo: {
          findUnique: jest.fn().mockResolvedValue({
            id: 99,
            sourceUrl: src,
            mp4Url: null,
            hlsPrefix: null,
            status: 'PROCESSING',
          }),
          update: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({}),
        },
      };
      let published = '';
      const real = new VideoFilesService(config());
      const files: any = {
        workDir: (id: number) => real.workDir(id),
        localCopy: jest.fn().mockResolvedValue(src),
        publishHls: jest.fn(async (_id: number, dir: string) => {
          published = join(work, 'published');
          await rm(published, { recursive: true, force: true });
          execFileSync('cp', ['-R', dir, published]);
          return 'hls/99-test';
        }),
        removeHls: jest.fn(),
        removeFile: jest.fn(),
        removeDir: (d: string) => real.removeDir(d),
      };
      const t = new TranscodeService(
        prisma,
        { register: jest.fn() } as any,
        files,
        config(),
      );
      t.run = spawnRunner;
      await t.transcode({ videoId: 99, sourceUrl: src });
      const final = prisma.lessonVideo.update.mock.calls.at(-1)[0];
      expect(final.data).toMatchObject({
        status: 'READY',
        renditions: '360',
        width: 640,
        height: 360,
        hasPoster: true,
      });
      const out = await readdir(published);
      expect(out).toEqual(
        expect.arrayContaining([
          'master.m3u8',
          '360p.m3u8',
          '360p_000.ts',
          'poster.jpg',
        ]),
      );
      expect(await readFile(join(published, '360p.m3u8'), 'utf8')).toContain(
        '#EXT-X-ENDLIST',
      );
      await rm(work, { recursive: true, force: true });
      expect(existsSync(work)).toBe(false);
    });
  },
);
