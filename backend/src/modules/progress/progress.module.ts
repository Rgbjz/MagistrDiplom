import { Module } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { CourseProgressController } from './course-progress.controller';

@Module({
  controllers: [CourseProgressController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
