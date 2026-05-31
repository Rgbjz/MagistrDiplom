import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import { ChatService } from '../chat/chat.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private progress: ProgressService,
    private chat: ChatService,
  ) {}

  async getDashboard(user: AuthUser) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: user.id },
      select: { firstName: true },
    });
    const name = profile?.firstName ?? null;
    const recentConversations = (
      await this.chat.listConversations(user.id)
    ).slice(0, 5);

    if (user.role !== 'STUDENT') {
      const teachingCourses = await this.prisma.course.findMany({
        where: { teacherId: user.id },
        select: { id: true, title: true, imageUrl: true },
        orderBy: { createdAt: 'desc' },
      });
      return { role: 'TEACHER', name, teachingCourses, recentConversations };
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      include: {
        course: { select: { id: true, title: true, imageUrl: true } },
      },
    });

    let completed = 0;
    const continueLearning: {
      id: number;
      title: string;
      imageUrl: string | null;
      percent: number;
    }[] = [];
    for (const e of enrollments) {
      const p = await this.progress.getProgress(e.courseId, user.id);
      if (p.percent >= 100) {
        completed++;
      } else {
        continueLearning.push({
          id: e.course.id,
          title: e.course.title,
          imageUrl: e.course.imageUrl,
          percent: p.percent,
        });
      }
    }

    const lessonsCompleted = await this.prisma.lessonProgress.count({
      where: { userId: user.id, status: 'COMPLETED' },
    });
    const passedTests = await this.prisma.testResult.findMany({
      where: { userId: user.id, passed: true },
      distinct: ['testId'],
      select: { testId: true },
    });
    const agg = await this.prisma.testResult.aggregate({
      where: { userId: user.id, finishedAt: { not: null } },
      _avg: { score: true },
    });
    const avgScore =
      agg._avg.score === null ? null : Math.round(agg._avg.score);

    return {
      role: 'STUDENT',
      name,
      stats: {
        enrolled: enrollments.length,
        completed,
        lessonsCompleted,
        testsPassed: passedTests.length,
        avgScore,
      },
      continueLearning,
      recentConversations,
    };
  }
}
