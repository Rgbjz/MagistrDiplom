import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface ProfileUpdate {
  firstName?: string;
  lastName?: string;
  bio?: string;
  avatarUrl?: string;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, profile: true },
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

  async getMyCourses(userId: number) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          include: { teacher: { select: { id: true, email: true } } },
        },
      },
    });
    return enrollments.map((enrollment) => enrollment.course);
  }
}
