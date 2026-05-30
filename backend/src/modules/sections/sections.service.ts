import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class SectionsService {
  constructor(private prisma: PrismaService) {}

  async create(courseId: number, data: { title?: string }, user: AuthUser) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.teacherId !== user.id) {
      throw new ForbiddenException('Not your course');
    }
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
    if (!section.course || section.course.teacherId !== user.id) {
      throw new ForbiddenException('Not your course');
    }
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
    if (!section.course || section.course.teacherId !== user.id) {
      throw new ForbiddenException('Not your course');
    }
    await this.prisma.section.delete({ where: { id } });
  }
}
