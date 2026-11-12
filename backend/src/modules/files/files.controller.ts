import {
  BadRequestException,
  Controller,
  Get,
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
import { basename, join } from 'path';
import { Readable } from 'stream';
import type { ReadableStream as WebReadableStream } from 'stream/web';
import {
  contentDisposition,
  FILE_KINDS,
  type FileKind,
  parseRange,
  protectedFolder,
} from './file-urls';
import { FilesService, type ResolvedFile } from './files.service';

/**
 * Protected downloads/streaming of lesson files, uploaded lesson videos and
 * assignment submissions. Accepts a signed URL (u, exp, sig — produced by the
 * API for the requesting user) or a Bearer access token.
 */
@Controller('files')
@SkipThrottle() // <video> seeking issues many Range requests
export class FilesController {
  constructor(
    private files: FilesService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  @Get(':kind/:id')
  async download(
    @Param('kind') kind: string,
    @Param('id', ParseIntPipe) id: number,
    @Query() q: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!FILE_KINDS.includes(kind as FileKind))
      throw new BadRequestException('Unknown file kind');
    const userId = this.identify(kind as FileKind, id, q, req);
    const file = await this.files.authorize(kind as FileKind, id, userId);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      contentDisposition(file.name, file.mimeType),
    );
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Accept-Ranges', 'bytes');
    if (file.url.startsWith('/public/')) await this.sendLocal(file, req, res);
    else await this.proxyBlob(file, req, res);
  }

  private identify(
    kind: FileKind,
    id: number,
    q: Record<string, string>,
    req: Request,
  ): number {
    if (q.sig) {
      const userId = Number(q.u);
      const exp = Number(q.exp);
      if (
        Number.isInteger(userId) &&
        this.files.verify(kind, id, userId, exp, q.sig)
      )
        return userId;
      throw new UnauthorizedException('Invalid or expired file link');
    }
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const payload = this.jwt.verify<{ id: number }>(header.slice(7), {
          secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        });
        if (payload?.id) return payload.id;
      } catch {
        // fall through
      }
    }
    throw new UnauthorizedException('Unauthorized');
  }

  private async sendLocal(file: ResolvedFile, req: Request, res: Response) {
    const folder = protectedFolder(file.url)!;
    const path = join(process.cwd(), 'public', folder, basename(file.url));
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

  private async proxyBlob(file: ResolvedFile, req: Request, res: Response) {
    const upstream = await fetch(file.url, {
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
      'accept-ranges',
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
