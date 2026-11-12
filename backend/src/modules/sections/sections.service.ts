import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertCourseRole,
  assertRoleOnCourse,
} from '../../common/access/course-access';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class SectionsService {
  constructor(private prisma: PrismaService) {}

  async create(courseId: number, data: { title?: string }, user: AuthUser) {
    await assertCourseRole(this.prisma, courseId, user, 'content');
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
    await assertRoleOnCourse(this.prisma, section.course, user, 'content');
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
    await assertRoleOnCourse(this.prisma, section.course, user, 'content');
    await this.prisma.section.delete({ where: { id } });
  }
}
