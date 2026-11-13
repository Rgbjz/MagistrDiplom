import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { AdaptiveService } from '../adaptive/adaptive.service';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCourseRole } from '../../common/access/course-access';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class ProgressService {
  constructor(
    private prisma: PrismaService,
    @Optional() private adaptive?: AdaptiveService,
  ) {}

  /** A student's progress as seen by the course team. */
  async getProgressAsStaff(courseId: number, userId: number, viewer: AuthUser) {
    await assertCourseRole(this.prisma, courseId, viewer, 'view');
    return this.getProgress(courseId, userId);
  }

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

    const assignments = await this.prisma.assignment.findMany({
      where: { lesson: { section: { courseId } } },
      select: { id: true },
    });
    const gradedSubmissions = await this.prisma.submission.findMany({
      where: {
        userId,
        status: 'GRADED',
        assignmentId: { in: assignments.map((a) => a.id) },
      },
      select: { assignmentId: true },
    });

    const total = lessonIds.length + testIds.length + assignments.length;
    const completed =
      completedLessons.length + passedTests.length + gradedSubmissions.length;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

    return {
      percent,
      total,
      completed,
      lessons: completedLessons.map((l) => l.lessonId),
      tests: passedTests.map((t) => t.testId),
      assignments: gradedSubmissions.map((s) => s.assignmentId),
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
      const updated = await this.prisma.lessonProgress.update({
        where: { id: progress.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      await this.adaptive?.onLessonCompleted(userId, lessonId);
      return updated;
    }
    return progress;
  }
}
