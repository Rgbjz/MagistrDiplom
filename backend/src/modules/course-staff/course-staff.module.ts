import { Module } from '@nestjs/common';
import { CourseStaffController } from './course-staff.controller';
import { CourseStaffService } from './course-staff.service';

@Module({
  controllers: [CourseStaffController],
  providers: [CourseStaffService],
})
export class CourseStaffModule {}
