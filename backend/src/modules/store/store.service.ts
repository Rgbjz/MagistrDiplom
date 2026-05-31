import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class StoreService {
  constructor(private prisma: PrismaService) {}

  async publicCourse(id: number) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        teacher: {
          select: {
            email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        sections: {
          orderBy: { order: 'asc' },
          include: {
            lessons: {
              orderBy: { order: 'asc' },
              select: { title: true, test: { select: { id: true } } },
            },
          },
        },
      },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    const p = course.teacher.profile;
    const name =
      p && (p.firstName || p.lastName)
        ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()
        : course.teacher.email;
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      imageUrl: course.imageUrl,
      price: course.price,
      teacher: { name },
      sections: course.sections.map((s) => ({
        title: s.title,
        lessons: s.lessons.map((l) => ({
          title: l.title,
          hasTest: !!l.test,
        })),
      })),
    };
  }

  async myStatus(courseId: number, userId: number) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    return { enrollmentStatus: enrollment?.status ?? null };
  }

  async purchase(courseId: number, user: AuthUser) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.price <= 0) {
      throw new BadRequestException('Course is free');
    }
    const existing = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId } },
    });
    if (existing && existing.status === 'ACTIVE') {
      throw new BadRequestException('Already purchased');
    }
    await this.prisma.payment.create({
      data: {
        userId: user.id,
        courseId,
        amount: course.price,
        status: 'PAID',
      },
    });
    await this.prisma.enrollment.upsert({
      where: { userId_courseId: { userId: user.id, courseId } },
      create: { userId: user.id, courseId, status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    });
    return { ok: true };
  }

  async myPurchases(userId: number) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
      include: {
        course: { select: { id: true, title: true, imageUrl: true } },
      },
    });
  }
}
