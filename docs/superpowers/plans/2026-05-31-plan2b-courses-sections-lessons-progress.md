# Plan 2b — Courses + Sections + Lessons + Enrollments + Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the course-domain backend: course CRUD + structure + enrollment flow, sections, lessons, lesson progress, and the course-progress endpoints — REST contract identical to the legacy Express app.

**Architecture:** Five NestJS modules. `ProgressModule` (shared `ProgressService` + `CourseProgressController`) is consumed by `CoursesModule`. `EnrollmentsModule` (`EnrollmentsService`) is consumed by `CoursesModule`. `SectionsModule` and `LessonsModule` are independent. Ownership checks live in services (teacher must own the course). Course images upload to `public/courses`, served at `/public/courses/<file>`.

**Tech Stack:** Node v24 (nvm), NestJS 11, Prisma 6, multer (course image). Builds on Plan 2a foundation (PrismaService, JwtAuthGuard, RolesGuard, @Roles, @CurrentUser, AllExceptionsFilter).

> **Tests out of scope** (per design spec). Verification uses build, server boot, `curl`, `psql`.

> **Env note:** Node not on default PATH — prepend `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"`. Postgres must be running (memory `magistrdiplom-local-postgres`). DB seeded: course id 1 (teacher@example.com), student1 ACTIVE, student2 PENDING.

> **tsconfig gotcha (carried from Plan 2a):** `isolatedModules` + `nodenext` + `emitDecoratorMetadata`. Any type used ONLY as a decorated handler-parameter type must use `import type` (e.g. `import type { AuthUser } from '...'`, with the value `CurrentUser` on a separate normal import). Prisma enum types used only as casts also use `import type`. DTO classes are values → normal import.

---

## File Structure (created by this plan)

```
backend/src/modules/
  progress/
    progress.service.ts
    course-progress.controller.ts
    progress.module.ts
  enrollments/
    enrollments.service.ts
    enrollments.module.ts
  courses/
    dto/create-course.dto.ts
    dto/update-course.dto.ts
    courses.service.ts
    courses.controller.ts
    courses.module.ts
  sections/
    dto/create-section.dto.ts
    dto/update-section.dto.ts
    sections.service.ts
    sections.controller.ts
    sections.module.ts
  lessons/
    dto/create-lesson.dto.ts
    dto/update-lesson.dto.ts
    lessons.service.ts
    lessons.controller.ts
    lessons.module.ts
backend/src/app.module.ts   # MODIFY: register the 5 modules
```

---

## Task 1: Progress module (service + course-progress controller)

**Files:** Create `backend/src/modules/progress/progress.service.ts`, `course-progress.controller.ts`, `progress.module.ts`

- [ ] **Step 1: `progress.service.ts`**

```typescript
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProgressService {
  constructor(private prisma: PrismaService) {}

  async getProgress(courseId: number, userId: number) {
    const lessons = await this.prisma.lesson.findMany({
      where: { section: { courseId } },
      select: { id: true },
    });
    const lessonIds = lessons.map((l) => l.id);

    const completedLessons = await this.prisma.lessonProgress.findMany({
      where: { userId, lessonId: { in: lessonIds }, status: 'COMPLETED' },
      select: { lessonId: true },
    });

    const tests = await this.prisma.test.findMany({
      where: { lesson: { section: { courseId } } },
      select: { id: true },
    });
    const testIds = tests.map((t) => t.id);

    const passedTests = await this.prisma.testResult.findMany({
      where: { userId, testId: { in: testIds }, passed: true },
      select: { testId: true },
    });

    const total = lessonIds.length + testIds.length;
    const completed = completedLessons.length + passedTests.length;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

    return {
      percent,
      total,
      completed,
      lessons: completedLessons.map((l) => l.lessonId),
      tests: passedTests.map((t) => t.testId),
    };
  }

  async startLesson(lessonId: number, userId: number) {
    const existing = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });
    if (!existing) {
      return this.prisma.lessonProgress.create({
        data: {
          userId,
          lessonId,
          status: 'IN_PROGRESS',
          startedAt: new Date(),
        },
      });
    }
    if (existing.status === 'NOT_STARTED') {
      return this.prisma.lessonProgress.update({
        where: { id: existing.id },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      });
    }
    return existing;
  }

  async completeLesson(lessonId: number, userId: number) {
    const progress = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });
    if (!progress) {
      throw new BadRequestException('Lesson not started');
    }
    if (progress.status !== 'COMPLETED') {
      return this.prisma.lessonProgress.update({
        where: { id: progress.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    }
    return progress;
  }
}
```

- [ ] **Step 2: `course-progress.controller.ts`**

```typescript
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
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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

  @Get('courses/:courseId/progress/:userId')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  getUserProgress(
    @Param('courseId', ParseIntPipe) courseId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.progress.getProgress(courseId, userId);
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
```

- [ ] **Step 3: `progress.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { CourseProgressController } from './course-progress.controller';

@Module({
  controllers: [CourseProgressController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
```

- [ ] **Step 4: Build + commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: clean (the module is not yet registered in AppModule, but tsc compiles all files). If errors in these files, STOP and report.

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/modules/progress
git commit -m "feat(backend): add progress module (service + courseProgress endpoints)"
```

---

## Task 2: Enrollments module (service only)

**Files:** Create `backend/src/modules/enrollments/enrollments.service.ts`, `enrollments.module.ts`

- [ ] **Step 1: `enrollments.service.ts`**

```typescript
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { EnrollmentStatus } from '@prisma/client';

@Injectable()
export class EnrollmentsService {
  constructor(private prisma: PrismaService) {}

  async request(userId: number, courseId: number) {
    return this.prisma.enrollment.create({
      data: { userId, courseId, status: 'PENDING', enrolledAt: new Date() },
    });
  }

  async approve(userId: number, courseId: number, teacherId: number) {
    return this.setStatus(userId, courseId, teacherId, 'ACTIVE');
  }

  async reject(userId: number, courseId: number, teacherId: number) {
    return this.setStatus(userId, courseId, teacherId, 'REJECTED');
  }

  private async setStatus(
    userId: number,
    courseId: number,
    teacherId: number,
    status: EnrollmentStatus,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.teacherId !== teacherId) {
      throw new ForbiddenException('Forbidden');
    }
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    return this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status },
    });
  }

  async getCourseEnrollments(courseId: number, status?: EnrollmentStatus) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId, ...(status ? { status } : {}) },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: {
              select: { firstName: true, lastName: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Match legacy response shape: expose the user under the `student` key.
    return enrollments.map(({ user, ...rest }) => ({
      ...rest,
      student: user,
    }));
  }
}
```

- [ ] **Step 2: `enrollments.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';

@Module({
  providers: [EnrollmentsService],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
```

- [ ] **Step 3: Build + commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: clean. If errors, STOP and report.

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/modules/enrollments
git commit -m "feat(backend): add enrollments service"
```

---

## Task 3: Courses module

**Files:** Create `backend/src/modules/courses/dto/create-course.dto.ts`, `dto/update-course.dto.ts`, `courses.service.ts`, `courses.controller.ts`, `courses.module.ts`

- [ ] **Step 1: `dto/create-course.dto.ts`**

```typescript
import { IsOptional, IsString } from 'class-validator';

export class CreateCourseDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;
}
```

- [ ] **Step 2: `dto/update-course.dto.ts`**

```typescript
import { IsOptional, IsString } from 'class-validator';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
```

- [ ] **Step 3: `courses.service.ts`**

```typescript
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import type {
  AuthUser,
  UserRole,
} from '../../common/decorators/current-user.decorator';

interface CreateCourseInput {
  title: string;
  description?: string;
  imageUrl?: string | null;
}

interface UpdateCourseInput {
  title?: string;
  description?: string;
  imageUrl?: string | null;
}

@Injectable()
export class CoursesService {
  constructor(
    private prisma: PrismaService,
    private progress: ProgressService,
  ) {}

  async create(data: CreateCourseInput, user: AuthUser) {
    if (user.role !== 'TEACHER') {
      throw new ForbiddenException('Only teachers can create courses');
    }
    return this.prisma.course.create({
      data: {
        title: data.title,
        description: data.description || '',
        imageUrl: data.imageUrl ?? null,
        teacherId: user.id,
      },
    });
  }

  async getCourseWithStructure(courseId: number, user: AuthUser) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        sections: {
          orderBy: { order: 'asc' },
          include: {
            lessons: { orderBy: { order: 'asc' }, include: { test: true } },
          },
        },
      },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    let enrollmentStatus: string | null = null;
    let progress: Awaited<ReturnType<ProgressService['getProgress']>> | null =
      null;

    if (user.role === 'STUDENT') {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: { userId: user.id, courseId, status: 'ACTIVE' },
      });
      if (!enrollment) {
        throw new ForbiddenException('You are not enrolled in this course');
      }
      enrollmentStatus = enrollment.status;
      progress = await this.progress.getProgress(courseId, user.id);
    }

    return { ...course, enrollmentStatus, progress };
  }

  async getCoursesForUser(user: AuthUser) {
    const courses = await this.prisma.course.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        imageUrl: true,
        teacherId: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (user.role !== 'STUDENT') {
      return courses;
    }
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: user.id },
    });
    const map: Record<number, string> = Object.fromEntries(
      enrollments.map((e) => [e.courseId, e.status]),
    );
    return courses.map((course) => ({
      ...course,
      enrollmentStatus: map[course.id] ?? null,
    }));
  }

  async update(courseId: number, data: UpdateCourseInput) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    return this.prisma.course.update({
      where: { id: courseId },
      data: {
        title: data.title ?? course.title,
        description: data.description ?? course.description,
        imageUrl: data.imageUrl ?? course.imageUrl,
      },
    });
  }

  async getStudentsProgress(courseId: number, teacherId: number, role: UserRole) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (role !== 'ADMIN' && course.teacherId !== teacherId) {
      throw new ForbiddenException('Access denied');
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId, status: 'ACTIVE' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (enrollments.length === 0) {
      return [];
    }
    const studentIds = enrollments.map((e) => e.userId);

    const totalLessons = await this.prisma.lesson.count({
      where: { section: { courseId } },
    });

    const lessonsProgress = await this.prisma.lessonProgress.findMany({
      where: { userId: { in: studentIds }, completedAt: { not: null } },
      select: { userId: true },
    });
    const lessonsByUser: Record<number, number> = {};
    for (const lp of lessonsProgress) {
      lessonsByUser[lp.userId] = (lessonsByUser[lp.userId] || 0) + 1;
    }

    const tests = await this.prisma.test.findMany({
      where: { lesson: { section: { courseId } } },
      select: { id: true },
    });
    const testIds = tests.map((t) => t.id);

    let testResults: {
      userId: number;
      testId: number;
      attempt: number;
      score: number | null;
    }[] = [];
    if (testIds.length > 0) {
      testResults = await this.prisma.testResult.findMany({
        where: {
          testId: { in: testIds },
          userId: { in: studentIds },
          finishedAt: { not: null },
        },
        orderBy: [{ userId: 'asc' }, { testId: 'asc' }, { attempt: 'desc' }],
        select: { userId: true, testId: true, attempt: true, score: true },
      });
    }

    const lastTestResults = new Map<
      string,
      { userId: number; testId: number; score: number | null }
    >();
    for (const r of testResults) {
      const key = `${r.userId}_${r.testId}`;
      if (!lastTestResults.has(key)) {
        lastTestResults.set(key, r);
      }
    }
    const testsByUser: Record<number, number> = {};
    const scoreSumByUser: Record<number, number> = {};
    for (const r of lastTestResults.values()) {
      testsByUser[r.userId] = (testsByUser[r.userId] || 0) + 1;
      scoreSumByUser[r.userId] =
        (scoreSumByUser[r.userId] || 0) + (r.score ?? 0);
    }

    return enrollments.map((e) => {
      const student = e.user;
      const profile = student.profile;
      const completedTests = testsByUser[student.id] || 0;
      const averageScore =
        completedTests > 0
          ? Math.round(scoreSumByUser[student.id] / completedTests)
          : null;
      return {
        userId: student.id,
        name: profile
          ? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim()
          : student.email,
        email: student.email,
        lessons: {
          completed: lessonsByUser[student.id] || 0,
          total: totalLessons,
        },
        tests: { completed: completedTests, total: testIds.length },
        averageScore,
      };
    });
  }

  async remove(courseId: number) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    await this.prisma.course.delete({ where: { id: courseId } });
  }
}
```

- [ ] **Step 4: `courses.controller.ts`**

> Note: legacy PATCH ignored the uploaded image on update (a bug). This controller injects the uploaded image URL on update too — an intentional improvement, consistent with create.

```typescript
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
```

- [ ] **Step 5: `courses.module.ts`**

```typescript
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
```

- [ ] **Step 6: Build + commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: clean. If errors, STOP and report exact error.

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/modules/courses
git commit -m "feat(backend): add courses module (CRUD, structure, enrollment flow, students progress)"
```

---

## Task 4: Sections module

**Files:** Create `backend/src/modules/sections/dto/create-section.dto.ts`, `dto/update-section.dto.ts`, `sections.service.ts`, `sections.controller.ts`, `sections.module.ts`

- [ ] **Step 1: `dto/create-section.dto.ts`**

```typescript
import { IsOptional, IsString } from 'class-validator';

export class CreateSectionDto {
  @IsOptional()
  @IsString()
  title?: string;
}
```

- [ ] **Step 2: `dto/update-section.dto.ts`**

```typescript
import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateSectionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
```

- [ ] **Step 3: `sections.service.ts`**

```typescript
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class SectionsService {
  constructor(private prisma: PrismaService) {}

  async create(courseId: number, data: { title?: string }, user: AuthUser) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.teacherId !== user.id) {
      throw new ForbiddenException('Not your course');
    }
    const agg = await this.prisma.section.aggregate({
      where: { courseId },
      _max: { order: true },
    });
    const order = (agg._max.order ?? 0) + 1;
    return this.prisma.section.create({
      data: { title: data.title ?? 'New section', courseId, order },
    });
  }

  async update(
    id: number,
    data: { title?: string; order?: number },
    user: AuthUser,
  ) {
    const section = await this.prisma.section.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!section) {
      throw new NotFoundException('Section not found');
    }
    if (!section.course || section.course.teacherId !== user.id) {
      throw new ForbiddenException('Not your course');
    }
    return this.prisma.section.update({ where: { id }, data });
  }

  async remove(id: number, user: AuthUser) {
    const section = await this.prisma.section.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!section) {
      throw new NotFoundException('Section not found');
    }
    if (!section.course || section.course.teacherId !== user.id) {
      throw new ForbiddenException('Not your course');
    }
    await this.prisma.section.delete({ where: { id } });
  }
}
```

- [ ] **Step 4: `sections.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';

@Controller('sections')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEACHER')
export class SectionsController {
  constructor(private sections: SectionsService) {}

  @Post(':courseId')
  create(
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() dto: CreateSectionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sections.create(courseId, dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSectionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sections.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sections.remove(id, user);
  }
}
```

- [ ] **Step 5: `sections.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { SectionsService } from './sections.service';
import { SectionsController } from './sections.controller';

@Module({
  controllers: [SectionsController],
  providers: [SectionsService],
})
export class SectionsModule {}
```

- [ ] **Step 6: Build + commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: clean. If errors, STOP and report.

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/modules/sections
git commit -m "feat(backend): add sections module"
```

---

## Task 5: Lessons module

**Files:** Create `backend/src/modules/lessons/dto/create-lesson.dto.ts`, `dto/update-lesson.dto.ts`, `lessons.service.ts`, `lessons.controller.ts`, `lessons.module.ts`

- [ ] **Step 1: `dto/create-lesson.dto.ts`**

```typescript
import { IsOptional, IsString } from 'class-validator';

export class CreateLessonDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;
}
```

- [ ] **Step 2: `dto/update-lesson.dto.ts`**

```typescript
import { IsOptional, IsString } from 'class-validator';

export class UpdateLessonDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  videoUrl?: string;
}
```

- [ ] **Step 3: `lessons.service.ts`**

```typescript
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class LessonsService {
  constructor(private prisma: PrismaService) {}

  async getLesson(lessonId: number, user: AuthUser) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { section: { include: { course: true } }, test: true },
    });
    if (!lesson || !lesson.section || !lesson.section.course) {
      throw new NotFoundException('Lesson not found');
    }
    const courseId = lesson.section.course.id;

    if (user.role === 'STUDENT') {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: { userId: user.id, courseId, status: 'ACTIVE' },
      });
      if (!enrollment) {
        throw new ForbiddenException('You are not enrolled in this course');
      }
    }

    let progress = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: user.id, lessonId } },
    });
    if (!progress) {
      progress = await this.prisma.lessonProgress.create({
        data: {
          userId: user.id,
          lessonId,
          status: 'IN_PROGRESS',
          startedAt: new Date(),
        },
      });
    }

    return { lesson, progress };
  }

  async completeLesson(lessonId: number, user: AuthUser) {
    const progress = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: user.id, lessonId } },
    });
    if (!progress) {
      throw new BadRequestException('Lesson not started');
    }
    if (progress.status === 'COMPLETED') {
      return;
    }
    await this.prisma.lessonProgress.update({
      where: { id: progress.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  async createLesson(
    sectionId: number,
    data: { title?: string; content?: string },
    user: AuthUser,
  ) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: { course: true },
    });
    if (!section || !section.course) {
      throw new NotFoundException('Section not found');
    }
    if (section.course.teacherId !== user.id) {
      throw new ForbiddenException('Not your course');
    }
    const agg = await this.prisma.lesson.aggregate({
      where: { sectionId },
      _max: { order: true },
    });
    const order = (agg._max.order ?? 0) + 1;
    return this.prisma.lesson.create({
      data: {
        title: data.title ?? 'New lesson',
        content: data.content ?? '',
        sectionId,
        order,
      },
    });
  }

  async updateLesson(
    lessonId: number,
    data: { title?: string; content?: string; videoUrl?: string },
    user: AuthUser,
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { section: { include: { course: true } } },
    });
    if (!lesson || !lesson.section || !lesson.section.course) {
      throw new NotFoundException('Lesson not found');
    }
    if (lesson.section.course.teacherId !== user.id) {
      throw new ForbiddenException('Not your course');
    }
    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        title: data.title,
        content: data.content,
        videoUrl: data.videoUrl,
      },
    });
  }

  async deleteLesson(lessonId: number, user: AuthUser) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { section: { include: { course: true } } },
    });
    if (!lesson || !lesson.section || !lesson.section.course) {
      throw new NotFoundException('Lesson not found');
    }
    if (lesson.section.course.teacherId !== user.id) {
      throw new ForbiddenException('Not your course');
    }
    await this.prisma.lesson.delete({ where: { id: lessonId } });
  }
}
```

- [ ] **Step 4: `lessons.controller.ts`**

```typescript
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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

@Controller('lessons')
export class LessonsController {
  constructor(private lessons: LessonsService) {}

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  getOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lessons.getLesson(id, user);
  }

  @Post(':sectionId')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER')
  create(
    @Param('sectionId', ParseIntPipe) sectionId: number,
    @Body() dto: CreateLessonDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lessons.createLesson(sectionId, dto, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLessonDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.lessons.updateLesson(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    await this.lessons.deleteLesson(id, user);
    return { message: 'Lesson deleted' };
  }

  @Post(':id/complete')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  async complete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    await this.lessons.completeLesson(id, user);
    return { message: 'Lesson completed' };
  }
}
```

- [ ] **Step 5: `lessons.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { LessonsController } from './lessons.controller';

@Module({
  controllers: [LessonsController],
  providers: [LessonsService],
})
export class LessonsModule {}
```

- [ ] **Step 6: Build + commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: clean. If errors, STOP and report.

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/modules/lessons
git commit -m "feat(backend): add lessons module"
```

---

## Task 6: Register modules in AppModule

**Files:** Modify `backend/src/app.module.ts`

- [ ] **Step 1: Replace `backend/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CoursesModule } from './modules/courses/courses.module';
import { SectionsModule } from './modules/sections/sections.module';
import { LessonsModule } from './modules/lessons/lessons.module';
import { ProgressModule } from './modules/progress/progress.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CoursesModule,
    SectionsModule,
    LessonsModule,
    ProgressModule,
  ],
})
export class AppModule {}
```

> Note: `EnrollmentsModule` is not listed here — it is imported by `CoursesModule` (which is where its service is used). `ProgressModule` is listed so `CourseProgressController` routes are registered.

- [ ] **Step 2: Build**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/app.module.ts
git commit -m "feat(backend): register courses/sections/lessons/progress modules"
```

---

## Task 7: End-to-end verification via curl

**Files:** none (runtime). Postgres must be running; DB seeded.

- [ ] **Step 1: Start the backend**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
/Applications/Postgres.app/Contents/Versions/latest/bin/pg_isready -h localhost -p 5432
( npm run start:dev > /tmp/nest-2b.log 2>&1 & ) ; sleep 10
grep -E "successfully started|ERROR" /tmp/nest-2b.log | head
```
Expected: started, no ERROR.

- [ ] **Step 2: Capture tokens + ids**

```bash
B=http://localhost:5000/api
TT=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"teacher@example.com","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')
S1=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"student1@example.com","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')
S2=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"student2@example.com","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')
PG=/Applications/Postgres.app/Contents/Versions/latest/bin/psql
S2ID=$($PG -h localhost -p 5432 -U macbookpro -d magistrdiplom -tAc "select id from \"User\" where email='student2@example.com';")
LID=$($PG -h localhost -p 5432 -U macbookpro -d magistrdiplom -tAc 'select id from "Lesson" order by id asc limit 1;')
echo "teacher/student tokens captured; student2 id=$S2ID lesson id=$LID"
```

- [ ] **Step 3: Student1 lists courses (enrollmentStatus ACTIVE for course 1)**

```bash
curl -s $B/courses -H "Authorization: Bearer $S1"
```
Expected: array; the course id 1 entry has `"enrollmentStatus":"ACTIVE"`.

- [ ] **Step 4: Student1 reads course structure (200, with progress)**

```bash
curl -s $B/courses/1 -H "Authorization: Bearer $S1" | node -pe 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); JSON.stringify({title:j.title, enrollmentStatus:j.enrollmentStatus, sections:j.sections.length, progress:j.progress})'
```
Expected: `{"title":"Intro to TypeScript","enrollmentStatus":"ACTIVE","sections":1,"progress":{"percent":0,...}}`.

- [ ] **Step 5: Student2 is PENDING → course read forbidden (403)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" $B/courses/1 -H "Authorization: Bearer $S2"
```
Expected: `403`.

- [ ] **Step 6: Teacher lists PENDING enrollments → sees student2**

```bash
curl -s "$B/courses/1/enrollments?status=PENDING" -H "Authorization: Bearer $TT" | node -pe 'const a=JSON.parse(require("fs").readFileSync(0,"utf8")); JSON.stringify(a.map(e=>({status:e.status,student:e.student.email})))'
```
Expected: contains `{"status":"PENDING","student":"student2@example.com"}`.

- [ ] **Step 7: Teacher approves student2 → ACTIVE; student2 can now read course**

```bash
curl -s -X POST $B/courses/1/enroll/$S2ID/approve -H "Authorization: Bearer $TT" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).status'
curl -s -o /dev/null -w "after approve, student2 GET course = %{http_code}\n" $B/courses/1 -H "Authorization: Bearer $S2"
```
Expected: prints `ACTIVE`, then `after approve, student2 GET course = 200`.

- [ ] **Step 8: Lesson progress flow (student1): open lesson, complete it, progress rises**

```bash
curl -s $B/lessons/$LID -H "Authorization: Bearer $S1" | node -pe 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); JSON.stringify({lesson:j.lesson.title, status:j.progress.status})'
curl -s -X POST $B/courseProgress/lessons/$LID/complete -H "Authorization: Bearer $S1" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).status'
curl -s $B/courseProgress/courses/1/progress -H "Authorization: Bearer $S1"
```
Expected: first prints `{"lesson":"What is TypeScript?","status":"IN_PROGRESS"}`, then `COMPLETED`, then a progress object where `completed` includes the lesson and `percent` > 0.

- [ ] **Step 9: Teacher views students' aggregated progress**

```bash
curl -s $B/courses/1/students/progress -H "Authorization: Bearer $TT"
```
Expected: array of `{ userId, name, email, lessons:{completed,total}, tests:{completed,total}, averageScore }`; student1 shows `lessons.completed >= 1`.

- [ ] **Step 10: Teacher creates a section (order increments)**

```bash
curl -s -X POST $B/sections/1 -H "Authorization: Bearer $TT" -H 'Content-Type: application/json' -d '{"title":"Section Two"}' | node -pe 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); JSON.stringify({title:j.title, order:j.order})'
```
Expected: `{"title":"Section Two","order":2}` (seed had one section at order 1).

- [ ] **Step 11: Role enforcement — student cannot create a section (403)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/sections/1 -H "Authorization: Bearer $S1" -H 'Content-Type: application/json' -d '{"title":"Nope"}'
```
Expected: `403`.

- [ ] **Step 12: Stop the server**

```bash
pkill -f "nest start" 2>/dev/null; pkill -f "start:dev" 2>/dev/null; true
```

No commit (verification only).

---

## Self-Review (author checklist — completed)

- **Spec/contract coverage:** Courses — POST, PATCH, GET `/`, GET `/:id`, GET `/:courseId/students/progress`, POST `/:id/enroll`, POST `/:id/enroll/:userId/approve|reject`, GET `/:id/enrollments`, DELETE `/:id` (Task 3). Sections — POST `/:courseId`, PATCH `/:id`, DELETE `/:id` all TEACHER-gated (Task 4). Lessons — GET `/:id`, POST `/:sectionId`, PATCH `/:id`, DELETE `/:id`, POST `/:id/complete` (Task 5). Course progress — GET `courses/:courseId/progress`, GET `.../progress/:userId`, POST `lessons/:lessonId/complete`, POST `lessons/:lessonId/start` (Task 1). Logic ported faithfully from legacy services (structure ordering, ACTIVE-enrollment gate, progress percent, last-attempt aggregation, order = max+1). ✓
- **Status codes:** approve/reject 200, enroll 201 (default), DELETE course 204, sections DELETE 204, POST lesson 200, lesson complete/start 200, lesson delete returns `{message}` at 200. ✓
- **Intentional deltas (documented):** PATCH course now injects uploaded image URL (legacy ignored it). Enrollment list exposes user under `student` key to match legacy response shape. ✓
- **isolatedModules compliance:** controllers import `AuthUser` and Prisma `EnrollmentStatus` via `import type`; `CurrentUser`/decorators/DTOs via normal import. ✓
- **Placeholder scan:** none. **Type consistency:** `userId_lessonId` / `userId_courseId` compound-unique selectors match the schema's `@@unique` definitions; `ProgressService.getProgress` return type reused via `Awaited<ReturnType<...>>`. ✓
- **Deferred to Plan 2c:** Tests module (test CRUD, questions/answers, start/submit/results) — the only remaining backend domain before the frontend.
