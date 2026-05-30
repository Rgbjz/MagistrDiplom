import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { EnrollmentStatus } from '@prisma/client';
import { CoursesService } from './courses.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

const courseImageInterceptor = FileInterceptor('image', {
  storage: diskStorage({
    destination: './public/courses',
    filename: (_req, file, cb) =>
      cb(null, `courses-${Date.now()}${extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

@Controller('courses')
@UseGuards(JwtAuthGuard)
export class CoursesController {
  constructor(
    private courses: CoursesService,
    private enrollments: EnrollmentsService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @UseInterceptors(courseImageInterceptor)
  create(
    @Body() dto: CreateCourseDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    const imageUrl = file ? `/public/courses/${file.filename}` : null;
    return this.courses.create({ ...dto, imageUrl }, user);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @UseInterceptors(courseImageInterceptor)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCourseDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const data: UpdateCourseDto & { imageUrl?: string } = { ...dto };
    if (file) {
      data.imageUrl = `/public/courses/${file.filename}`;
    }
    return this.courses.update(id, data);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.courses.getCoursesForUser(user);
  }

  @Get(':id')
  getOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.courses.getCourseWithStructure(id, user);
  }

  @Get(':courseId/students/progress')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  studentsProgress(
    @Param('courseId', ParseIntPipe) courseId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.courses.getStudentsProgress(courseId, user.id, user.role);
  }

  @Post(':id/enroll')
  @UseGuards(RolesGuard)
  @Roles('STUDENT')
  enroll(
    @Param('id', ParseIntPipe) courseId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.enrollments.request(userId, courseId);
  }

  @Post(':id/enroll/:userId/approve')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  approve(
    @Param('id', ParseIntPipe) courseId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('id') teacherId: number,
  ) {
    return this.enrollments.approve(userId, courseId, teacherId);
  }

  @Post(':id/enroll/:userId/reject')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  reject(
    @Param('id', ParseIntPipe) courseId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('id') teacherId: number,
  ) {
    return this.enrollments.reject(userId, courseId, teacherId);
  }

  @Get(':id/enrollments')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  enrollmentsList(
    @Param('id', ParseIntPipe) courseId: number,
    @Query('status') status?: string,
  ) {
    const normalized = status
      ? (status.toUpperCase() as EnrollmentStatus)
      : undefined;
    return this.enrollments.getCourseEnrollments(courseId, normalized);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.courses.remove(id);
  }
}
