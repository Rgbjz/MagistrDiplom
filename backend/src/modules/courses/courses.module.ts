import { Module } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';
import { ProgressModule } from '../progress/progress.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { VideosModule } from '../videos/videos.module';

@Module({
  imports: [
    ProgressModule,
    EnrollmentsModule,
    CertificatesModule,
    VideosModule,
  ],
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
