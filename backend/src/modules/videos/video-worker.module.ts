import { Module } from '@nestjs/common';
import { TranscodeService } from './transcode.service';
import { VideoFilesService } from './video-files.service';

/** Video transcoding processor for the standalone worker process. */
@Module({ providers: [TranscodeService, VideoFilesService] })
export class VideoWorkerModule {}
