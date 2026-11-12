import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SkipThrottle } from '@nestjs/throttler';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ALLOWED_VIDEO_TYPES, MAX_VIDEO_BYTES } from './hls';
import { CompleteBlobDto } from './dto/complete-blob.dto';
import { InitUploadDto } from './dto/init-upload.dto';
import { VideoFilesService } from './video-files.service';
import { VideosService } from './videos.service';

/**
 * Lesson video uploads. Locally: resumable chunked uploads to disk.
 * With BLOB_READ_WRITE_TOKEN: the browser uploads straight to Vercel Blob
 * (upload-token) and then calls /complete. Either way the API never holds the
 * file in memory, and the result is transcoded to HLS in the background.
 */
@Controller()
export class VideosController {
  constructor(
    private videos: VideosService,
    private files: VideoFilesService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  @Post('lessons/:lessonId/video/uploads')
  @UseGuards(JwtAuthGuard)
  init(
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @Body() dto: InitUploadDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.videos.initUpload(lessonId, user, dto);
  }

  @Get('lessons/:lessonId/video')
  @UseGuards(JwtAuthGuard)
  async get(
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return { video: await this.videos.get(lessonId, user) };
  }

  @Delete('lessons/:lessonId/video')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async remove(
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @CurrentUser() user: AuthUser,
  ) {
    await this.videos.remove(lessonId, user);
  }

  @Post('lessons/:lessonId/video/retry')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  retry(
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.videos.retry(lessonId, user);
  }

  @Post('lessons/:lessonId/video/complete')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  completeBlob(
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @Body() dto: CompleteBlobDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.videos.completeBlobUpload(lessonId, user, dto.url);
  }

  /**
   * @vercel/blob client-upload handshake. Token requests come from the
   * browser (Bearer required); upload-completed calls come from Vercel and
   * are verified by handleUpload itself.
   */
  @Post('lessons/:lessonId/video/upload-token')
  @HttpCode(200)
  async uploadToken(
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @Body() body: HandleUploadBody,
    @Req() req: Request,
  ) {
    if (!this.files.blobToken)
      throw new UnauthorizedException('Blob uploads are not configured');
    return handleUpload({
      body,
      request: req,
      token: this.files.blobToken,
      onBeforeGenerateToken: async () => {
        const user = this.bearerUser(req);
        await this.videos.assertCanEdit(lessonId, user);
        return {
          allowedContentTypes: Object.keys(ALLOWED_VIDEO_TYPES),
          maximumSizeInBytes: MAX_VIDEO_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ lessonId, userId: user.id }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        if (this.videos.isOwnBlobSource(blob.url)) {
          const size = await this.files.size({ kind: 'remote', url: blob.url });
          await this.videos.attachSource(lessonId, blob.url, size ?? 0);
        }
      },
    });
  }

  @Get('videos/uploads/:uploadId')
  @UseGuards(JwtAuthGuard)
  status(@Param('uploadId') uploadId: string, @CurrentUser() user: AuthUser) {
    return this.videos.uploadStatus(uploadId, user);
  }

  /** Raw chunk body (application/octet-stream), streamed to disk. */
  @Put('videos/uploads/:uploadId/chunks/:index')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  chunk(
    @Param('uploadId') uploadId: string,
    @Param('index', ParseIntPipe) index: number,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
  ) {
    return this.videos.putChunk(uploadId, index, user, req);
  }

  @Post('videos/uploads/:uploadId/complete')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  complete(@Param('uploadId') uploadId: string, @CurrentUser() user: AuthUser) {
    return this.videos.completeUpload(uploadId, user);
  }

  private bearerUser(req: Request): AuthUser {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const p = this.jwt.verify<AuthUser>(header.slice(7), {
          secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        });
        if (p?.id) return { id: p.id, role: p.role, email: p.email };
      } catch {
        // fall through
      }
    }
    throw new UnauthorizedException('Unauthorized');
  }
}
