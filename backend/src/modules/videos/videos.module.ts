import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { FilesModule } from '../files/files.module';
import { HlsController } from './hls.controller';
import { TranscodeService } from './transcode.service';
import { UploadsService } from './uploads.service';
import { VideoFilesService } from './video-files.service';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [JwtModule.register({}), FilesModule],
  controllers: [VideosController, HlsController],
  providers: [
    VideosService,
    VideoFilesService,
    UploadsService,
    TranscodeService,
  ],
  exports: [VideosService, TranscodeService],
})
export class VideosModule {}
