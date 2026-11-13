import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { displayName, nameSelect } from '../../common/utils/names';
import type { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import type { AdminUpdateUserDto } from './dto/update-user.dto';

const PAGE_SIZE = 20;

const userSelect = {
  id: true,
  email: true,
  role: true,
  emailVerified: true,
  blocked: true,
  createdAt: true,
  profile: { select: { firstName: true, lastName: true } },
} as const;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function toAdminUser(u: UserRow) {
  const name = displayName(u);
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    emailVerified: u.emailVerified,
    blocked: u.blocked,
    createdAt: u.createdAt,
    name: name === u.email ? null : name,
  };
}

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async stats() {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [byRole, courses, publishedCourses, payments] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.course.count(),
      this.prisma.course.count({ where: { published: true } }),
      this.prisma.payment.aggregate({
        where: { createdAt: { gte: monthStart } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);
    const count = (role: string) =>
      byRole.find((r) => r.role === role)?._count._all ?? 0;

    return {
      users: byRole.reduce((n, r) => n + r._count._all, 0),
      students: count('STUDENT'),
      teachers: count('TEACHER'),
      admins: count('ADMIN'),
      courses,
      publishedCourses,
      paymentsMonthCount: payments._count._all,
      paymentsMonthSum: payments._sum.amount ?? 0,
    };
  }

  async users(query: AdminUsersQueryDto) {
    const page = query.page ?? 1;
    const where: Prisma.UserWhereInput = {};
    if (query.role) where.role = query.role;
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        {
          profile: {
            firstName: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          profile: {
            lastName: { contains: query.search, mode: 'insensitive' },
          },
        },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: userSelect,
      }),
    ]);
    return { items: rows.map(toAdminUser), total, page, pageSize: PAGE_SIZE };
  }

  async updateUser(id: number, adminId: number, dto: AdminUpdateUserDto) {
    if (id === adminId) {
      throw new BadRequestException('You cannot change your own account');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        role: dto.role,
        blocked: dto.blocked,
        ...(dto.emailVerified
          ? { emailVerified: true, verificationToken: null }
          : {}),
        // An admin action also lifts a temporary login lockout.
        failedLoginCount: 0,
        lockedUntil: null,
      },
      select: userSelect,
    });
    // Blocking or a role change invalidates refresh tokens, so the new state
    // applies on the user's next token refresh.
    if (dto.blocked || (dto.role && dto.role !== user.role)) {
      await this.prisma.session.deleteMany({ where: { userId: id } });
    }
    return toAdminUser(updated);
  }

  async payments(limit = 10) {
    const rows = await this.prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      select: {
        id: true,
        amount: true,
        createdAt: true,
        user: { select: { id: true, ...nameSelect } },
        course: { select: { id: true, title: true } },
      },
    });
    return rows.map((p) => {
      const name = displayName(p.user);
      return {
        id: p.id,
        amount: p.amount,
        createdAt: p.createdAt,
        user: {
          id: p.user.id,
          email: p.user.email,
          name: name === p.user.email ? null : name,
        },
        course: p.course,
      };
    });
  }

  async courses() {
    const rows = await this.prisma.course.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        published: true,
        price: true,
        createdAt: true,
        teacher: { select: nameSelect },
        _count: {
          select: {
            enrollments: { where: { status: { in: ['ACTIVE', 'COMPLETED'] } } },
          },
        },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      title: c.title,
      published: c.published,
      price: c.price,
      teacher: { name: displayName(c.teacher) },
      studentsCount: c._count.enrollments,
      createdAt: c.createdAt,
    }));
  }
}
