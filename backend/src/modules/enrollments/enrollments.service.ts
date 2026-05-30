import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { EnrollmentStatus } from '@prisma/client';

@Injectable()
export class EnrollmentsService {
  constructor(private prisma: PrismaService) {}

  async request(userId: number, courseId: number) {
    return this.prisma.enrollment.create({
      data: { userId, courseId, status: 'PENDING', enrolledAt: new Date() },
    });
  }

  async approve(userId: number, courseId: number, teacherId: number) {
    return this.setStatus(userId, courseId, teacherId, 'ACTIVE');
  }

  async reject(userId: number, courseId: number, teacherId: number) {
    return this.setStatus(userId, courseId, teacherId, 'REJECTED');
  }

  private async setStatus(
    userId: number,
    courseId: number,
    teacherId: number,
    status: EnrollmentStatus,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.teacherId !== teacherId) {
      throw new ForbiddenException('Forbidden');
    }
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    return this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status },
    });
  }

  async getCourseEnrollments(courseId: number, status?: EnrollmentStatus) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
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
