import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { displayName, nameSelect } from '../../common/utils/names';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { CatalogQueryDto } from './dto/catalog-query.dto';
import { msg } from '../../common/i18n';

/** Enrollments that count as "students" of a course. */
const STUDENT_STATUSES = ['ACTIVE', 'COMPLETED'] as const;

@Injectable()
export class StoreService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async catalog(query: CatalogQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;

    const where: Prisma.CourseWhereInput = { published: true };
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.category) where.category = query.category;
    if (query.level) where.level = query.level;
    if (query.price === 'free') where.price = 0;
    if (query.price === 'paid') where.price = { gt: 0 };

    const orderBy: Prisma.CourseOrderByWithRelationInput[] =
      query.sort === 'popular'
        ? [{ enrollments: { _count: 'desc' } }, { createdAt: 'desc' }]
        : query.sort === 'price_asc'
          ? [{ price: 'asc' }, { createdAt: 'desc' }]
          : query.sort === 'price_desc'
            ? [{ price: 'desc' }, { createdAt: 'desc' }]
            : [{ createdAt: 'desc' }];

    const [total, rows, categoryRows] = await Promise.all([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          description: true,
          imageUrl: true,
          price: true,
          category: true,
          level: true,
          teacher: { select: nameSelect },
          sections: { select: { _count: { select: { lessons: true } } } },
          _count: {
            select: {
              sections: true,
              enrollments: {
                where: { status: { in: [...STUDENT_STATUSES] } },
              },
            },
          },
        },
      }),
      this.prisma.course.findMany({
        where: { published: true, category: { not: null } },
        distinct: ['category'],
        select: { category: true },
        orderBy: { category: 'asc' },
      }),
    ]);

    return {
      items: rows.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        imageUrl: c.imageUrl,
        price: c.price,
        category: c.category,
        level: c.level,
        teacher: { name: displayName(c.teacher) },
        sectionsCount: c._count.sections,
        lessonsCount: c.sections.reduce((n, s) => n + s._count.lessons, 0),
        studentsCount: c._count.enrollments,
      })),
      total,
      page,
      pageSize,
      categories: categoryRows
        .map((r) => r.category)
        .filter((c): c is string => !!c),
    };
  }

  async publicCourse(id: number) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        teacher: {
          select: {
            email: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
                bio: true,
                avatarUrl: true,
              },
            },
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
        _count: {
          select: {
            enrollments: {
              where: { status: { in: [...STUDENT_STATUSES] } },
            },
          },
        },
      },
    });
    if (!course || !course.published) {
      throw new NotFoundException('Course not found');
    }
    const lessons = course.sections.flatMap((s) => s.lessons);
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      imageUrl: course.imageUrl,
      price: course.price,
      category: course.category,
      level: course.level,
      autoApprove: course.autoApprove,
      sectionsCount: course.sections.length,
      lessonsCount: lessons.length,
      testsCount: lessons.filter((l) => l.test).length,
      studentsCount: course._count.enrollments,
      teacher: {
        name: displayName(course.teacher),
        bio: course.teacher.profile?.bio ?? null,
        avatarUrl: course.teacher.profile?.avatarUrl ?? null,
      },
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
    if (!course || !course.published) {
      throw new NotFoundException('Course not found');
    }
    if (course.price <= 0) {
      throw new BadRequestException('Course is free');
    }

    // Serializable so two concurrent clicks can't create two payments.
    await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.enrollment.findUnique({
          where: { userId_courseId: { userId: user.id, courseId } },
        });
        if (existing && existing.status === 'ACTIVE') {
          throw new BadRequestException('Already purchased');
        }
        await tx.payment.create({
          data: {
            userId: user.id,
            courseId,
            amount: course.price,
            status: 'PAID',
          },
        });
        await tx.enrollment.upsert({
          where: { userId_courseId: { userId: user.id, courseId } },
          create: { userId: user.id, courseId, status: 'ACTIVE' },
          update: { status: 'ACTIVE' },
        });
      },
      { isolationLevel: 'Serializable' },
    );

    await this.notifications.notify(user.id, {
      type: 'PAYMENT',
      title: msg('notify.payment.title', { course: course.title }),
      body: msg('notify.payment.body', { amount: course.price }),
      link: `/courses/${courseId}`,
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
