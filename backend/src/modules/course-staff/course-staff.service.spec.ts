/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- loose Prisma mocks */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CourseStaffService } from './course-staff.service';

const owner = { id: 7, role: 'TEACHER' as const, email: 'o@x.io' };
const teacher = { id: 8, role: 'TEACHER' as const, email: 't@x.io' };

describe('CourseStaffService', () => {
  let prisma: any;
  let notifications: { notify: jest.Mock };
  let service: CourseStaffService;

  beforeEach(() => {
    prisma = {
      course: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 1, teacherId: 7, title: 'Web' }),
        update: jest.fn(),
      },
      courseStaff: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
      user: { findFirst: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    notifications = { notify: jest.fn() };
    service = new CourseStaffService(prisma, notifications as any);
  });

  it('owner adds a teacher account as TEACHER and notifies them', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 8,
      role: 'TEACHER',
      blocked: false,
    });
    await service.add(1, 'T@x.io', 'TEACHER', owner);
    expect(prisma.courseStaff.create).toHaveBeenCalledWith({
      data: { courseId: 1, userId: 8, role: 'TEACHER' },
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      8,
      expect.objectContaining({ type: 'COURSE_STAFF_ADDED' }),
    );
  });

  it('a student account can only be an assistant', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 20,
      role: 'STUDENT',
      blocked: false,
    });
    await expect(
      service.add(1, 's@x.io', 'TEACHER', owner),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.add(1, 's@x.io', 'ASSISTANT', owner);
    expect(prisma.courseStaff.create).toHaveBeenCalledWith({
      data: { courseId: 1, userId: 20, role: 'ASSISTANT' },
    });
  });

  it('unknown email → 404; a non-owner teacher cannot manage the team', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.add(1, 'x@x.io', 'ASSISTANT', owner),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.courseStaff.findUnique.mockResolvedValue({ role: 'TEACHER' });
    await expect(
      service.add(1, 'x@x.io', 'ASSISTANT', teacher),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the owner row cannot be removed or demoted', async () => {
    prisma.courseStaff.findUnique.mockResolvedValue({
      id: 1,
      role: 'OWNER',
      user: { role: 'TEACHER' },
    });
    await expect(service.remove(1, 7, owner)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.update(1, 7, 'ASSISTANT', owner),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('transfer makes the teacher the owner and keeps the old owner as TEACHER', async () => {
    prisma.courseStaff.findUnique.mockImplementation(({ where }: any) =>
      where.courseId_userId.userId === 8
        ? { id: 5, role: 'TEACHER', user: { role: 'TEACHER' } }
        : null,
    );
    await service.transfer(1, 8, owner);
    expect(prisma.course.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { teacherId: 8 },
    });
    expect(prisma.courseStaff.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { role: 'TEACHER' } }),
    );
  });
});
