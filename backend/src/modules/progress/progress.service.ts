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
