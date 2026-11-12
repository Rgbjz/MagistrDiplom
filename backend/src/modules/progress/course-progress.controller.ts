import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ProgressService } from './progress.service';

@Controller('courseProgress')
@UseGuards(JwtAuthGuard)
export class CourseProgressController {
  constructor(private progress: ProgressService) {}

  @Get('courses/:courseId/progress')
  getMyProgress(
    @Param('courseId', ParseIntPipe) courseId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.progress.getProgress(courseId, userId);
  }

  // Course team only (previously any teacher could read any student's progress).
  @Get('courses/:courseId/progress/:userId')
  getUserProgress(
    @Param('courseId', ParseIntPipe) courseId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.progress.getProgressAsStaff(courseId, userId, user);
  }

  @Post('lessons/:lessonId/complete')
  @HttpCode(200)
  complete(
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.progress.completeLesson(lessonId, userId);
  }

  @Post('lessons/:lessonId/start')
  @HttpCode(200)
  start(
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.progress.startLesson(lessonId, userId);
  }
}
