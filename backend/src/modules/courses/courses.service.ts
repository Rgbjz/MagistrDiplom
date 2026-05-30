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
