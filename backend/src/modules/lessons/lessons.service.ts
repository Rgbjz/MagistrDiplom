import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService, originalName } from '../storage/storage.service';
import { VideosService } from '../videos/videos.service';
import { msg } from '../../common/i18n';
import {
  assertRoleOnCourse,
  can,
  getCourseRole,
} from '../../common/access/course-access';

const MAX_FILES_PER_LESSON = 20;

@Injectable()
export class LessonsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private storage: StorageService,
    private videos: VideosService,
  ) {}

  /** Loads a lesson and checks that `user` may edit its course content. */
  private async ownedLesson(lessonId: number, user: AuthUser) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { section: { include: { course: true } } },
    });
    if (!lesson || !lesson.section || !lesson.section.course) {
      throw new NotFoundException('Lesson not found');
    }
    await assertRoleOnCourse(
      this.prisma,
      lesson.section.course,
      user,
      'content',
    );
    return lesson;
  }

  async getLesson(lessonId: number, user: AuthUser) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        section: { include: { course: true } },
        test: true,
        files: { orderBy: { id: 'asc' } },
        video: true,
      },
    });
    if (!lesson || !lesson.section || !lesson.section.course) {
      throw new NotFoundException('Lesson not found');
    }
    const courseId = lesson.section.course.id;

    if (user.role === 'STUDENT') {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: { userId: user.id, courseId, status: 'ACTIVE' },
      });
      // A student account may also be on the course team (assistant).
      if (
        !enrollment &&
        !can(await getCourseRole(this.prisma, courseId, user), 'view')
      ) {
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
    await assertRoleOnCourse(this.prisma, section.course, user, 'content');
    const agg = await this.prisma.lesson.aggregate({
      where: { sectionId },
      _max: { order: true },
    });
    const order = (agg._max.order ?? 0) + 1;
    const lesson = await this.prisma.lesson.create({
      data: {
        title: data.title ?? 'New lesson',
        content: data.content ?? '',
        sectionId,
        order,
      },
    });

    // The title is usually filled in right after creation, so it's not quoted.
    if (section.course.published) {
      const students = await this.prisma.enrollment.findMany({
        where: { courseId: section.courseId, status: 'ACTIVE' },
        select: { userId: true },
      });
      await this.notifications.notifyMany(
        students.map((s) => s.userId),
        {
          type: 'NEW_LESSON',
          title: msg('notify.newLesson.title', {
            course: section.course.title,
          }),
          body: msg('notify.newLesson.body', { section: section.title }),
          link: `/courses/${section.courseId}`,
        },
      );
    }
    return lesson;
  }

  async updateLesson(
    lessonId: number,
    data: { title?: string; content?: string; videoUrl?: string },
    user: AuthUser,
  ) {
    const lesson = await this.ownedLesson(lessonId, user);
    const updated = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        title: data.title,
        content: data.content,
        videoUrl: data.videoUrl,
      },
    });
    // An uploaded video replaced by a link (or cleared) is no longer needed.
    if (
      data.videoUrl !== undefined &&
      data.videoUrl !== lesson.videoUrl &&
      this.storage.isStored(lesson.videoUrl)
    ) {
      await this.storage.remove(lesson.videoUrl);
    }
    return updated;
  }

  async deleteLesson(lessonId: number, user: AuthUser) {
    const lesson = await this.ownedLesson(lessonId, user);
    const files = await this.prisma.lessonFile.findMany({
      where: { lessonId },
      select: { url: true },
    });
    await this.videos.removeForLesson(lessonId);
    await this.prisma.lesson.delete({ where: { id: lessonId } });
    await Promise.all([
      ...files.map((f) => this.storage.remove(f.url)),
      this.storage.isStored(lesson.videoUrl)
        ? this.storage.remove(lesson.videoUrl)
        : Promise.resolve(),
    ]);
  }

  // ===== Attachments =====

  async addFile(
    lessonId: number,
    file: Express.Multer.File | undefined,
    user: AuthUser,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    await this.ownedLesson(lessonId, user);
    const count = await this.prisma.lessonFile.count({ where: { lessonId } });
    if (count >= MAX_FILES_PER_LESSON) {
      throw new BadRequestException(
        `A lesson can have at most ${MAX_FILES_PER_LESSON} files`,
      );
    }
    const url = await this.storage.save(file, 'lessons');
    return this.prisma.lessonFile.create({
      data: {
        lessonId,
        name: originalName(file),
        url,
        size: file.size,
        mimeType: file.mimetype || 'application/octet-stream',
      },
    });
  }

  async deleteFile(fileId: number, user: AuthUser) {
    const file = await this.prisma.lessonFile.findUnique({
      where: { id: fileId },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    await this.ownedLesson(file.lessonId, user);
    await this.prisma.lessonFile.delete({ where: { id: fileId } });
    await this.storage.remove(file.url);
  }
}
