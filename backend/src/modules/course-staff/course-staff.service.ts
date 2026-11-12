import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CourseStaffRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { assertCourseRole } from '../../common/access/course-access';
import { displayName } from '../../common/utils/names';
import { msg } from '../../common/i18n';
import { NotificationsService } from '../notifications/notifications.service';
import type { AssignableRole } from './course-staff.dto';

const userSelect = {
  id: true,
  email: true,
  role: true,
  profile: { select: { firstName: true, lastName: true, avatarUrl: true } },
} as const;

const ROLE_ORDER: Record<CourseStaffRole, number> = {
  OWNER: 0,
  TEACHER: 1,
  ASSISTANT: 2,
};

/**
 * Course team management. The owner stays in Course.teacherId (kept for
 * compatibility) and also has an OWNER row; teachers and assistants only exist
 * as CourseStaff rows. Teacher accounts may be added as TEACHER or ASSISTANT;
 * student accounts only as ASSISTANT (e.g. a senior student checking work).
 */
@Injectable()
export class CourseStaffService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async list(courseId: number, user: AuthUser) {
    const { course, role } = await assertCourseRole(
      this.prisma,
      courseId,
      user,
      'view',
    );
    await this.ensureOwnerRow(course.id, course.teacherId);
    const rows = await this.prisma.courseStaff.findMany({
      where: { courseId },
      include: { user: { select: userSelect } },
    });
    const staff = rows
      .map((r) => ({
        userId: r.userId,
        role: r.role,
        addedAt: r.createdAt,
        name: displayName(r.user),
        email: r.user.email,
        avatarUrl: r.user.profile?.avatarUrl ?? null,
        accountRole: r.user.role,
      }))
      .sort(
        (a, b) =>
          ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
          a.name.localeCompare(b.name),
      );
    return { myRole: role, staff };
  }

  async add(
    courseId: number,
    email: string,
    role: AssignableRole,
    user: AuthUser,
  ) {
    const { course } = await assertCourseRole(
      this.prisma,
      courseId,
      user,
      'owner',
    );
    const target = await this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
      select: { id: true, role: true, blocked: true },
    });
    if (!target || target.blocked) {
      throw new NotFoundException('User not found');
    }
    this.assertEligible(target.role, role);
    if (target.id === course.teacherId) {
      throw new BadRequestException('User is already the course owner');
    }
    const existing = await this.prisma.courseStaff.findUnique({
      where: { courseId_userId: { courseId, userId: target.id } },
    });
    if (existing) {
      throw new BadRequestException('User is already on the course team');
    }
    await this.prisma.courseStaff.create({
      data: { courseId, userId: target.id, role },
    });
    await this.notifications.notify(target.id, {
      type: 'COURSE_STAFF_ADDED',
      title: msg('notify.staffAdded.title', { course: course.title }),
      body: msg(
        role === 'TEACHER'
          ? 'notify.staffAdded.body.TEACHER'
          : 'notify.staffAdded.body.ASSISTANT',
      ),
      link: `/courses/${courseId}/manage`,
    });
    return this.list(courseId, user);
  }

  async update(
    courseId: number,
    userId: number,
    role: AssignableRole,
    user: AuthUser,
  ) {
    await assertCourseRole(this.prisma, courseId, user, 'owner');
    const row = await this.staffRow(courseId, userId);
    if (row.role === 'OWNER') {
      throw new BadRequestException(
        'Use ownership transfer to change the owner',
      );
    }
    this.assertEligible(row.user.role, role);
    await this.prisma.courseStaff.update({
      where: { id: row.id },
      data: { role },
    });
    return this.list(courseId, user);
  }

  async remove(courseId: number, userId: number, user: AuthUser) {
    await assertCourseRole(this.prisma, courseId, user, 'owner');
    const row = await this.staffRow(courseId, userId);
    if (row.role === 'OWNER') {
      throw new BadRequestException('The course owner cannot be removed');
    }
    await this.prisma.courseStaff.delete({ where: { id: row.id } });
  }

  /** Hands the course to another TEACHER on the team; the old owner stays as TEACHER. */
  async transfer(courseId: number, userId: number, user: AuthUser) {
    const { course } = await assertCourseRole(
      this.prisma,
      courseId,
      user,
      'owner',
    );
    const row = await this.staffRow(courseId, userId);
    if (row.role === 'OWNER') {
      throw new BadRequestException('User is already the course owner');
    }
    if (row.user.role !== 'TEACHER') {
      throw new BadRequestException('Only a teacher account can own a course');
    }
    await this.prisma.$transaction([
      this.prisma.courseStaff.upsert({
        where: { courseId_userId: { courseId, userId: course.teacherId } },
        create: { courseId, userId: course.teacherId, role: 'TEACHER' },
        update: { role: 'TEACHER' },
      }),
      this.prisma.courseStaff.update({
        where: { id: row.id },
        data: { role: 'OWNER' },
      }),
      this.prisma.course.update({
        where: { id: courseId },
        data: { teacherId: userId },
      }),
    ]);
    await this.notifications.notify(userId, {
      type: 'COURSE_STAFF_ADDED',
      title: msg('notify.staffOwner.title', { course: course.title }),
      link: `/courses/${courseId}/manage`,
    });
    return this.list(courseId, user);
  }

  private assertEligible(accountRole: string, role: AssignableRole) {
    if (accountRole === 'ADMIN') {
      throw new BadRequestException('Administrators already have full access');
    }
    if (role === 'TEACHER' && accountRole !== 'TEACHER') {
      throw new BadRequestException(
        'Only a teacher account can be a course teacher',
      );
    }
  }

  private async staffRow(courseId: number, userId: number) {
    const row = await this.prisma.courseStaff.findUnique({
      where: { courseId_userId: { courseId, userId } },
      include: { user: { select: { role: true } } },
    });
    if (!row) {
      throw new NotFoundException('Team member not found');
    }
    return row;
  }

  /** Courses created before the team feature may lack the OWNER row. */
  private async ensureOwnerRow(courseId: number, teacherId: number) {
    await this.prisma.courseStaff.upsert({
      where: { courseId_userId: { courseId, userId: teacherId } },
      create: { courseId, userId: teacherId, role: 'OWNER' },
      update: {},
    });
  }
}
