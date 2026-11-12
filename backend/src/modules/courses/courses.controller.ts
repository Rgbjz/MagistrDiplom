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
import { StorageService } from '../storage/storage.service';
import { imageUploadOptions } from '../storage/upload.options';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { EnrollmentStatus } from '@prisma/client';
import { CoursesService } from './courses.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { CertificatesService } from '../certificates/certificates.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

const ENROLLMENT_STATUSES: EnrollmentStatus[] = [
  'PENDING',
  'ACTIVE',
  'REJECTED',
  'COMPLETED',
];

const courseImageInterceptor = FileInterceptor(
  'image',
  imageUploadOptions(5 * 1024 * 1024),
);

@Controller('courses')
@UseGuards(JwtAuthGuard)
export class CoursesController {
  constructor(
    private courses: CoursesService,
    private enrollments: EnrollmentsService,
    private certificates: CertificatesService,
    private storage: StorageService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @UseInterceptors(courseImageInterceptor)
  async create(
    @Body() dto: CreateCourseDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    const imageUrl = file ? await this.storage.save(file, 'courses') : null;
    return this.courses.create({ ...dto, imageUrl }, user);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @UseInterceptors(courseImageInterceptor)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCourseDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    const data: UpdateCourseDto & { imageUrl?: string } = { ...dto };
    if (file) {
      data.imageUrl = await this.storage.save(file, 'courses');
    }
    return this.courses.update(id, data, user);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    return this.courses.getCoursesForUser(user, search);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.courses.getCourseWithStructure(id, user);
  }

  // Course team incl. assistants (checked in the service).
  @Get(':courseId/students/progress')
  studentsProgress(
    @Param('courseId', ParseIntPipe) courseId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.courses.getStudentsProgress(courseId, user);
  }

  // Course team incl. assistants (checked in the service).
  @Get(':id/tests-summary')
  testsSummary(
    @Param('id', ParseIntPipe) courseId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.courses.getTestsSummary(courseId, user);
  }

  @Post(':id/certificate')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('STUDENT')
  issueCertificate(
    @Param('id', ParseIntPipe) courseId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.certificates.issue(courseId, userId);
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
  approve(
    @Param('id', ParseIntPipe) courseId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.enrollments.approve(userId, courseId, user);
  }

  @Post(':id/enroll/:userId/reject')
  @HttpCode(200)
  reject(
    @Param('id', ParseIntPipe) courseId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.enrollments.reject(userId, courseId, user);
  }

  // Course team incl. assistants (checked in the service).
  @Get(':id/enrollments')
  enrollmentsList(
    @Param('id', ParseIntPipe) courseId: number,
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
  ) {
    const upper = status?.toUpperCase();
    const normalized = ENROLLMENT_STATUSES.includes(upper as EnrollmentStatus)
      ? (upper as EnrollmentStatus)
      : undefined;
    return this.enrollments.getCourseEnrollments(courseId, user, normalized);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.courses.remove(id, user);
  }
}
