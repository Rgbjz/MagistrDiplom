import { Module } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { ProgressModule } from '../progress/progress.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';

@Module({
  imports: [ProgressModule, EnrollmentsModule],
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
