import { AdaptiveModule } from '../adaptive/adaptive.module';
import { Module } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { LessonsController } from './lessons.controller';
import { VideosModule } from '../videos/videos.module';

@Module({
  imports: [AdaptiveModule, VideosModule],
  controllers: [LessonsController],
  providers: [LessonsService],
})
export class LessonsModule {}
