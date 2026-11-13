import { Module } from '@nestjs/common';
import { CloudinaryService } from '../storage/cloudinary.service';
import { TranscodeService } from './transcode.service';
import { VideoFilesService } from './video-files.service';

/** Video transcoding processor for the standalone worker process. */
@Module({
  providers: [TranscodeService, VideoFilesService, CloudinaryService],
})
export class VideoWorkerModule {}
