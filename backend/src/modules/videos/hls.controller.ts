import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import type { ReadableStream as WebReadableStream } from 'stream/web';
import { PrismaService } from '../../prisma/prisma.service';
import { parseRange } from '../files/file-urls';
import { FilesService } from '../files/files.service';
import { HLS_FILE, signPlaylist } from './hls';
import {
  contentTypeOf,
  type FileLocation,
  VideoFilesService,
} from './video-files.service';
import { VideosService } from './videos.service';

/**
 * Protected HLS delivery: GET /api/files/hls/:videoId/<file> with the signed
 * query (u, exp, sig) or a Bearer token. Playlists are rewritten so every
 * variant/segment URI carries the same signature; segments, the poster and
 * the MP4 fallback are streamed with Range support (or proxied from Blob).
 */
@Controller('files/hls')
@SkipThrottle()
export class HlsController {
  constructor(
    private prisma: PrismaService,
    private filesService: FilesService,
    private videoFiles: VideoFilesService,
    private videos: VideosService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  @Get(':videoId/:file')
  async serve(
    @Param('videoId', ParseIntPipe) videoId: number,
    @Param('file') file: string,
    @Query() q: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!HLS_FILE.test(file)) throw new NotFoundException('File not found');
    const userId = this.identify(videoId, q, req);
    const video = await this.prisma.lessonVideo.findUnique({
      where: { id: videoId },
    });
    if (!video) throw new NotFoundException('File not found');
    if (!(await this.videos.canWatch(video.lessonId, userId)))
      throw new ForbiddenException('Access denied');

    let loc: FileLocation | null;
    if (file === 'source.mp4') {
      loc = video.mp4Url ? this.videoFiles.locate(video.mp4Url) : null;
    } else {
      if (video.status !== 'READY' && file.endsWith('.m3u8'))
        throw new NotFoundException('Video is not ready');
      loc = video.hlsPrefix
        ? this.videoFiles.locateHls(video.hlsPrefix, file)
        : null;
    }
    if (!loc) throw new NotFoundException('File not found');

    res.setHeader('Content-Type', contentTypeOf(file));
    if (file.endsWith('.m3u8')) {
      // Playlists are tiny; re-sign them on each request.
      let text: string;
      try {
        text = await this.videoFiles.readText(loc);
      } catch {
        throw new NotFoundException('File not found');
      }
      res.setHeader('Cache-Control', 'private, no-cache');
      res.send(signPlaylist(text, this.filesService.hlsQuery(videoId, userId)));
      return;
    }
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Accept-Ranges', 'bytes');
    if (loc.kind === 'local') await this.sendLocal(loc.path, req, res);
    else await this.proxy(loc.url, req, res);
  }

  private identify(
    videoId: number,
    q: Record<string, string>,
    req: Request,
  ): number {
    if (q.sig) {
      const userId = Number(q.u);
      if (
        Number.isInteger(userId) &&
        this.filesService.verify(
          'lesson-hls',
          videoId,
          userId,
          Number(q.exp),
          q.sig,
        )
      )
        return userId;
      throw new UnauthorizedException('Invalid or expired file link');
    }
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const p = this.jwt.verify<{ id: number }>(header.slice(7), {
          secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        });
        if (p?.id) return p.id;
      } catch {
        // fall through
      }
    }
    throw new UnauthorizedException('Unauthorized');
  }

  private async sendLocal(path: string, req: Request, res: Response) {
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      res.status(404).json({ message: 'File not found' });
      return;
    }
    const range = parseRange(req.headers.range, size);
    if (range === 'invalid') {
      res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
      return;
    }
    if (range) {
      res.status(206);
      res.setHeader(
        'Content-Range',
        `bytes ${range.start}-${range.end}/${size}`,
      );
      res.setHeader('Content-Length', String(range.end - range.start + 1));
      createReadStream(path, range).pipe(res);
    } else {
      res.setHeader('Content-Length', String(size));
      createReadStream(path).pipe(res);
    }
  }

  private async proxy(url: string, req: Request, res: Response) {
    const upstream = await fetch(url, {
      headers: req.headers.range ? { Range: req.headers.range } : {},
    });
    if (!upstream.ok && upstream.status !== 206) {
      res.status(upstream.status === 416 ? 416 : 502).end();
      return;
    }
    res.status(upstream.status);
    for (const h of [
      'content-length',
      'content-range',
      'etag',
      'last-modified',
    ]) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (!upstream.body) {
      res.end();
      return;
    }
    Readable.fromWeb(upstream.body as unknown as WebReadableStream).pipe(res);
  }
}
