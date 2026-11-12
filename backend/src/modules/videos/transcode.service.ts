import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import {
  hlsArgs,
  masterPlaylist,
  parseSourceInfo,
  posterArgs,
  progressMicros,
  renditionsFor,
} from './hls';
import { VideoFilesService } from './video-files.service';

export const VIDEO_QUEUE = 'video';
export const TRANSCODE_JOB = 'transcode';

export interface TranscodeJob {
  videoId: number;
  /** The source being transcoded; a newer upload makes this job obsolete. */
  sourceUrl: string;
}

/** Runs a process without a shell; resolves with stderr, rejects on failure. */
export type Runner = (
  cmd: string,
  args: string[],
  onStdoutLine?: (line: string) => void,
) => Promise<{ code: number; stderr: string }>;

export const spawnRunner: Runner = (cmd, args, onLine) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let buffered = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buffered += chunk.toString();
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      if (onLine) lines.forEach(onLine);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-20_000);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, stderr }));
  });

/**
 * Background transcoding of lesson videos into HLS (720p/360p + poster) on
 * the "video" queue, one job at a time. Progress is persisted so the editor
 * can poll it; failures leave a readable error on the record.
 */
@Injectable()
export class TranscodeService implements OnModuleInit {
  private readonly logger = new Logger(TranscodeService.name);
  private readonly ffmpeg: string;
  run: Runner = spawnRunner;

  constructor(
    private prisma: PrismaService,
    private queue: QueueService,
    private files: VideoFilesService,
    config: ConfigService,
  ) {
    this.ffmpeg = config.get<string>('FFMPEG_PATH') || 'ffmpeg';
  }

  onModuleInit() {
    this.queue.register<TranscodeJob>(
      VIDEO_QUEUE,
      TRANSCODE_JOB,
      (job) => this.transcode(job),
      { concurrency: 1 },
    );
  }

  enqueue(videoId: number, sourceUrl: string, version: Date) {
    return this.queue.enqueue<TranscodeJob>(
      VIDEO_QUEUE,
      TRANSCODE_JOB,
      { videoId, sourceUrl },
      { jobId: `transcode-${videoId}-${version.getTime()}`, attempts: 1 },
    );
  }

  async transcode({ videoId, sourceUrl }: TranscodeJob): Promise<void> {
    const video = await this.prisma.lessonVideo.findUnique({
      where: { id: videoId },
    });
    if (!video) return;
    const current = video.sourceUrl ?? video.mp4Url;
    if (current !== sourceUrl) return; // replaced by a newer upload

    const work = await this.files.workDir(videoId);
    const out = join(work, 'out');
    let lastSaved = -1;
    const setProgress = async (value: number) => {
      const p = Math.max(0, Math.min(99, Math.floor(value)));
      if (p - lastSaved < 3) return;
      lastSaved = p;
      await this.prisma.lessonVideo
        .updateMany({ where: { id: videoId }, data: { progress: p } })
        .catch(() => undefined);
    };

    try {
      await this.prisma.lessonVideo.update({
        where: { id: videoId },
        data: {
          status:
            video.mp4Url && !video.sourceUrl ? video.status : 'PROCESSING',
          progress: 0,
          error: null,
        },
      });
      await mkdir(out, { recursive: true });
      const input = await this.files.localCopy(sourceUrl, work);

      const probe = await this.run(this.ffmpeg, ['-hide_banner', '-i', input]);
      const info = parseSourceInfo(probe.stderr);
      if (!info || info.durationSec <= 0)
        throw new Error(
          'Could not read the video (unsupported or corrupt file)',
        );

      const renditions = renditionsFor(info);
      const totalUs = info.durationSec * 1_000_000;
      for (let i = 0; i < renditions.length; i++) {
        const r = renditions[i];
        const res = await this.run(
          this.ffmpeg,
          hlsArgs(input, out, r, info.hasAudio),
          (line) => {
            const us = progressMicros(line);
            if (us !== null) {
              void setProgress(
                ((i + Math.min(1, us / totalUs)) / renditions.length) * 95,
              );
            }
          },
        );
        if (res.code !== 0)
          throw new Error(
            `ffmpeg failed (${r.height}p): ${lastLine(res.stderr)}`,
          );
      }
      const poster = await this.run(
        this.ffmpeg,
        posterArgs(input, join(out, 'poster.jpg'), info.durationSec),
      );
      const hasPoster = poster.code === 0;
      await writeFile(join(out, 'master.m3u8'), masterPlaylist(renditions));
      await setProgress(97);

      const prefix = await this.files.publishHls(videoId, out);

      // The upload may have been replaced or deleted while we worked.
      const latest = await this.prisma.lessonVideo.findUnique({
        where: { id: videoId },
      });
      if (!latest || (latest.sourceUrl ?? latest.mp4Url) !== sourceUrl) {
        await this.files.removeHls(prefix);
        return;
      }
      const keepAsMp4 = /\.mp4$/i.test(sourceUrl);
      await this.prisma.lessonVideo.update({
        where: { id: videoId },
        data: {
          status: 'READY',
          progress: 100,
          hlsPrefix: prefix,
          renditions: renditions.map((r) => r.height).join(','),
          hasPoster,
          durationSec: info.durationSec,
          width: info.width,
          height: info.height,
          error: null,
          mp4Url: keepAsMp4 ? sourceUrl : latest.mp4Url,
          sourceUrl: keepAsMp4 ? sourceUrl : null,
        },
      });
      if (latest.hlsPrefix && latest.hlsPrefix !== prefix)
        await this.files.removeHls(latest.hlsPrefix);
      if (!keepAsMp4 && latest.sourceUrl)
        await this.files.removeFile(latest.sourceUrl);
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(
        0,
        500,
      );
      this.logger.warn(`Video ${videoId} transcoding failed: ${message}`);
      const latest = await this.prisma.lessonVideo.findUnique({
        where: { id: videoId },
      });
      if (latest && (latest.sourceUrl ?? latest.mp4Url) === sourceUrl) {
        // A legacy MP4 stays playable progressively even if HLS failed.
        await this.prisma.lessonVideo.update({
          where: { id: videoId },
          data: {
            status: latest.mp4Url ? 'READY' : 'FAILED',
            progress: latest.mp4Url ? 100 : 0,
            error: message,
          },
        });
      }
    } finally {
      await this.files.removeDir(work);
    }
  }
}

function lastLine(stderr: string): string {
  const lines = stderr.trim().split('\n');
  return (lines[lines.length - 1] ?? '').slice(0, 300);
}
