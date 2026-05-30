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
