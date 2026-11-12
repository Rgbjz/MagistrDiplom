import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EnrollmentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  assertCourseRole,
  courseStaffIds,
} from '../../common/access/course-access';
import { displayName } from '../../common/utils/names';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { msg } from '../../common/i18n';

@Injectable()
export class EnrollmentsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async request(userId: number, courseId: number) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course || !course.published) {
      throw new NotFoundException('Course not found');
    }
    if (course.price > 0) {
      throw new BadRequestException('Paid course: purchase it instead');
    }
    const existing = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (existing && existing.status !== 'REJECTED') {
      throw new BadRequestException('Already enrolled');
    }

    const status: EnrollmentStatus = course.autoApprove ? 'ACTIVE' : 'PENDING';
    const enrollment = existing
      ? await this.prisma.enrollment.update({
          where: { id: existing.id },
          data: { status, enrolledAt: new Date() },
        })
      : await this.prisma.enrollment.create({
          data: { userId, courseId, status, enrolledAt: new Date() },
        });

    if (status === 'PENDING') {
      const student = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          profile: { select: { firstName: true, lastName: true } },
        },
      });
      await this.notifications.notifyMany(
        await courseStaffIds(this.prisma, course, ['OWNER', 'TEACHER']),
        {
          type: 'ENROLLMENT_REQUEST',
          title: msg('notify.enrollmentRequest.title', {
            course: course.title,
          }),
          body: student ? displayName(student) : null,
          link: `/courses/${courseId}/manage`,
        },
      );
    }
    return enrollment;
  }

  approve(userId: number, courseId: number, user: AuthUser) {
    return this.setStatus(userId, courseId, user, 'ACTIVE');
  }

  reject(userId: number, courseId: number, user: AuthUser) {
    return this.setStatus(userId, courseId, user, 'REJECTED');
  }

  private async setStatus(
    userId: number,
    courseId: number,
    user: AuthUser,
    status: 'ACTIVE' | 'REJECTED',
  ) {
    const { course } = await assertCourseRole(
      this.prisma,
      courseId,
      user,
      'manage',
    );
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    const updated = await this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status },
    });
    await this.notifications.notify(userId, {
      type: status === 'ACTIVE' ? 'ENROLLMENT_APPROVED' : 'ENROLLMENT_REJECTED',
      title:
        status === 'ACTIVE'
          ? msg('notify.enrollmentApproved.title', { course: course.title })
          : msg('notify.enrollmentRejected.title', { course: course.title }),
      body: status === 'ACTIVE' ? msg('notify.enrollmentApproved.body') : null,
      link: status === 'ACTIVE' ? `/courses/${courseId}` : `/c/${courseId}`,
    });
    return updated;
  }

  async getCourseEnrollments(
    courseId: number,
    user: AuthUser,
    status?: EnrollmentStatus,
  ) {
    await assertCourseRole(this.prisma, courseId, user, 'view');
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
    return enrollments.map(({ user, ...rest }) => ({
      ...rest,
      student: user,
    }));
  }
}
