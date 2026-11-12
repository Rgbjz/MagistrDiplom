import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import { displayName, nameSelect } from '../../common/utils/names';

interface ProfileUpdate {
  firstName?: string;
  lastName?: string;
  bio?: string;
  avatarUrl?: string;
  emailNotifications?: boolean;
  deadlineReminders?: boolean;
  locale?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private progress: ProgressService,
  ) {}

  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        profile: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateProfile(userId: number, data: ProfileUpdate) {
    const existing = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!existing) {
      return this.prisma.userProfile.create({ data: { userId, ...data } });
    }
    return this.prisma.userProfile.update({ where: { userId }, data });
  }

  private async checkPassword(userId: number, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!(await bcrypt.compare(password, user.password))) {
      throw new BadRequestException('Wrong password');
    }
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ) {
    await this.checkPassword(userId, currentPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: await bcrypt.hash(newPassword, 10) },
    });
  }

  async listSessions(userId: number, currentSid?: number) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return sessions.map((s) => ({ ...s, current: s.id === currentSid }));
  }

  /** Revokes every session except the one the request was made with. */
  async deleteOtherSessions(userId: number, currentSid?: number) {
    if (!currentSid) {
      throw new BadRequestException('Current session unknown, sign in again');
    }
    await this.prisma.session.deleteMany({
      where: { userId, id: { not: currentSid } },
    });
  }

  async deleteSession(userId: number, sessionId: number) {
    const { count } = await this.prisma.session.deleteMany({
      where: { id: sessionId, userId },
    });
    if (count === 0) {
      throw new NotFoundException('Session not found');
    }
  }

  async deleteAccount(userId: number, password: string) {
    await this.checkPassword(userId, password);
    // Courses keep a required teacher reference, so they must go first.
    const courses = await this.prisma.course.count({
      where: { teacherId: userId },
    });
    if (courses > 0) {
      throw new BadRequestException('Delete or transfer your courses first');
    }
    await this.prisma.user.delete({ where: { id: userId } });
  }

  async getMyCourses(userId: number) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            imageUrl: true,
            price: true,
            teacher: { select: nameSelect },
            sections: {
              orderBy: { order: 'asc' },
              select: {
                lessons: {
                  orderBy: { order: 'asc' },
                  select: { id: true, title: true },
                },
              },
            },
          },
        },
      },
    });

    const certificates = await this.prisma.certificate.findMany({
      where: { userId },
      select: { courseId: true, code: true },
    });
    const certByCourse = new Map(certificates.map((c) => [c.courseId, c.code]));

    return Promise.all(
      enrollments.map(async (e) => {
        const course = e.course;
        const lessons = course.sections.flatMap((s) => s.lessons);
        const lessonIds = lessons.map((l) => l.id);
        const p = await this.progress.getProgress(course.id, userId);
        const done = new Set(p.lessons);
        const next = lessons.find((l) => !done.has(l.id)) ?? null;

        const lastLesson = await this.prisma.lessonProgress.findFirst({
          where: { userId, lessonId: { in: lessonIds } },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        });
        const scores = await this.prisma.testResult.aggregate({
          where: {
            userId,
            finishedAt: { not: null },
            test: { lesson: { section: { courseId: course.id } } },
          },
          _avg: { score: true },
          _max: { finishedAt: true },
        });
        const activity = [lastLesson?.updatedAt, scores._max.finishedAt]
          .filter((d): d is Date => !!d)
          .sort((a, b) => b.getTime() - a.getTime())[0];

        return {
          course: {
            id: course.id,
            title: course.title,
            imageUrl: course.imageUrl,
            price: course.price,
            teacher: { name: displayName(course.teacher) },
          },
          status: e.status,
          enrolledAt: e.enrolledAt,
          completedAt: e.completedAt,
          progress: {
            percent: p.percent,
            completed: p.completed,
            total: p.total,
          },
          nextLesson: next ? { id: next.id, title: next.title } : null,
          lastActivityAt: activity ?? null,
          avgScore:
            scores._avg.score === null ? null : Math.round(scores._avg.score),
          certificateCode: certByCourse.get(course.id) ?? null,
        };
      }),
    );
  }
}
