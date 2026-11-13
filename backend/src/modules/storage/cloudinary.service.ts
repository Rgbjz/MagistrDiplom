import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import {
  CLOUDINARY_DEFAULT_MAX_FILE_MB,
  CLOUDINARY_DEFAULT_MAX_VIDEO_MB,
  type CloudinaryDeliveryType,
  type CloudinaryRef,
  type CloudinaryResourceType,
} from './cloudinary-ref';

/** Adaptive streaming profile for lesson videos (up to 1080p). */
export const STREAMING_PROFILE = 'hd';
const HLS_EAGER = [{ streaming_profile: STREAMING_PROFILE, format: 'm3u8' }];

export interface UploadedVideo {
  ref: CloudinaryRef;
  durationSec: number | null;
  width: number | null;
  height: number | null;
}

/**
 * Thin wrapper over the Cloudinary SDK, enabled by CLOUDINARY_URL
 * (cloudinary://<api_key>:<api_secret>@<cloud_name>). Without it every
 * method is unused and the app stores files in Vercel Blob or on disk.
 */
@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  readonly enabled: boolean;
  readonly cloudName: string | null = null;
  readonly maxFileBytes: number;
  readonly maxVideoBytes: number;

  constructor(config: ConfigService) {
    const url = config.get<string>('CLOUDINARY_URL')?.trim();
    const mb = (key: string, fallback: number) =>
      (Number(config.get<string>(key)) || fallback) * 1024 * 1024;
    this.maxFileBytes = mb(
      'CLOUDINARY_MAX_FILE_MB',
      CLOUDINARY_DEFAULT_MAX_FILE_MB,
    );
    this.maxVideoBytes = mb(
      'CLOUDINARY_MAX_VIDEO_MB',
      CLOUDINARY_DEFAULT_MAX_VIDEO_MB,
    );
    if (!url) {
      this.enabled = false;
      return;
    }
    const m = /^cloudinary:\/\/([^:@/]+):([^@/]+)@([\w-]+)\/?$/.exec(url);
    if (!m) {
      // Better to stop than to silently put uploads somewhere else.
      throw new Error(
        'CLOUDINARY_URL must look like cloudinary://<api_key>:<api_secret>@<cloud_name>',
      );
    }
    this.enabled = true;
    this.cloudName = m[3];
    cloudinary.config({
      cloud_name: m[3],
      api_key: m[1],
      api_secret: decodeURIComponent(m[2]),
      secure: true,
    });
  }

  /** Uploads a buffer under `publicId` (a folder path, see cloudinary-ref). */
  async uploadBuffer(
    buffer: Buffer,
    opts: {
      publicId: string;
      resourceType: CloudinaryResourceType;
      type: CloudinaryDeliveryType;
    },
  ): Promise<UploadApiResponse> {
    const limit =
      opts.resourceType === 'video' ? this.maxVideoBytes : this.maxFileBytes;
    if (buffer.length > limit) throw tooLarge(limit);
    try {
      return await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: opts.publicId,
            resource_type: opts.resourceType,
            type: opts.type,
            overwrite: false,
          },
          (err, res) => (err || !res ? reject(asError(err)) : resolve(res)),
        );
        stream.end(buffer);
      });
    } catch (err) {
      throw this.httpError(err, limit);
    }
  }

  /**
   * Uploads a lesson video from disk in chunks and asks Cloudinary to build
   * the HLS renditions in the background (eager_async). Videos are delivered
   * as `upload` (not signed): HLS segment URLs inside a playlist can't carry
   * a signature, so privacy relies on the unguessable public id.
   */
  async uploadVideo(path: string, publicId: string): Promise<UploadedVideo> {
    try {
      const res = await new Promise<UploadApiResponse>((resolve, reject) => {
        void cloudinary.uploader.upload_large(
          path,
          {
            public_id: publicId,
            resource_type: 'video',
            type: 'upload',
            chunk_size: 20 * 1024 * 1024,
            eager: HLS_EAGER,
            eager_async: true,
          },
          (err, r) => (err || !r ? reject(asError(err)) : resolve(r)),
        );
      });
      return {
        ref: { resourceType: 'video', type: 'upload', publicId: res.public_id },
        durationSec: typeof res.duration === 'number' ? res.duration : null,
        width: res.width ?? null,
        height: res.height ?? null,
      };
    } catch (err) {
      throw this.httpError(err, this.maxVideoBytes);
    }
  }

  /** Re-requests the HLS renditions of an already uploaded video (retry). */
  async requestHls(ref: CloudinaryRef): Promise<void> {
    await cloudinary.uploader.explicit(ref.publicId, {
      resource_type: 'video',
      type: ref.type,
      eager: HLS_EAGER,
      eager_async: true,
    });
  }

  /** Delivery URL; private (`authenticated`) files get a signed URL. */
  url(ref: CloudinaryRef, extra: Record<string, unknown> = {}): string {
    return cloudinary.url(ref.publicId, {
      resource_type: ref.resourceType,
      type: ref.type,
      sign_url: ref.type === 'authenticated',
      secure: true,
      ...extra,
    });
  }

  hlsUrl(ref: CloudinaryRef): string {
    return this.url(ref, {
      streaming_profile: STREAMING_PROFILE,
      format: 'm3u8',
    });
  }

  posterUrl(ref: CloudinaryRef): string {
    return this.url(ref, { start_offset: 'auto', format: 'jpg' });
  }

  mp4Url(ref: CloudinaryRef): string {
    return this.url(ref, { format: 'mp4' });
  }

  async destroy(ref: CloudinaryRef): Promise<void> {
    await cloudinary.uploader.destroy(ref.publicId, {
      resource_type: ref.resourceType,
      type: ref.type,
      invalidate: true,
    });
  }

  /**
   * Reference of a public delivery URL from our own cloud, e.g.
   * https://res.cloudinary.com/<cloud>/image/upload/v17…/lms/avatars/x.png.
   */
  refFromUrl(url: string): CloudinaryRef | null {
    if (!this.cloudName) return null;
    const m = new RegExp(
      `^https://res\\.cloudinary\\.com/${this.cloudName}/(image|video|raw)/(upload|authenticated)/(?:v\\d+/)?([\\w./-]+)$`,
    ).exec(url);
    if (!m) return null;
    const resourceType = m[1] as CloudinaryResourceType;
    // Image/video public ids have no extension; raw ones keep it.
    const publicId =
      resourceType === 'raw' ? m[3] : m[3].replace(/\.[a-z0-9]+$/i, '');
    return {
      resourceType,
      type: m[2] as CloudinaryDeliveryType,
      publicId,
    };
  }

  /** Cloudinary's error → a readable 4xx/502 instead of an opaque 500. */
  private httpError(err: unknown, limit: number) {
    const e = err as { message?: string; http_code?: number } | undefined;
    const message = e?.message ?? String(err);
    this.logger.warn(`Cloudinary upload failed: ${message}`);
    if (/file size too large|too large/i.test(message)) return tooLarge(limit);
    if (e?.http_code && e.http_code >= 400 && e.http_code < 500)
      return new BadRequestException(
        `File storage rejected the file: ${message}`,
      );
    return new BadGatewayException(
      'File storage is unavailable, try again later',
    );
  }
}

/** The SDK reports failures as plain objects `{ message, http_code }`. */
function asError(err: unknown): Error {
  if (err instanceof Error) return err;
  const e = err as { message?: string; http_code?: number } | undefined;
  return Object.assign(new Error(e?.message ?? 'Upload failed'), {
    http_code: e?.http_code,
  });
}

function tooLarge(limit: number) {
  return new PayloadTooLargeException(
    `File is too large for the file storage (max ${Math.round(limit / 1024 / 1024)} MB)`,
  );
}
