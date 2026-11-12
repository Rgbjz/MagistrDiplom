/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- loose Prisma mocks */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  assertCourseRole,
  can,
  courseStaffIds,
  getCourseRole,
  type CoursePermission,
} from './course-access';

const perms: CoursePermission[] = [
  'view',
  'manage',
  'grade',
  'content',
  'owner',
];

describe('course access matrix', () => {
  it.each([
    ['OWNER', ['view', 'manage', 'grade', 'content', 'owner']],
    ['TEACHER', ['view', 'manage', 'grade', 'content']],
    ['ASSISTANT', ['view', 'manage', 'grade']],
    ['ADMIN', ['view', 'manage', 'grade', 'content', 'owner']],
  ] as const)('%s', (role, allowed) => {
    for (const p of perms) {
      expect(can(role, p)).toBe((allowed as readonly string[]).includes(p));
    }
  });

  it('denies everything without a role', () => {
    for (const p of perms) expect(can(null, p)).toBe(false);
  });
});

describe('course role lookup', () => {
  let prisma: any;
  beforeEach(() => {
    prisma = {
      course: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, teacherId: 7 }),
      },
      courseStaff: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
  });

  it('owner by teacherId, staff by row, admin always', async () => {
    expect(await getCourseRole(prisma, 1, { id: 7, role: 'TEACHER' })).toBe(
      'OWNER',
    );
    expect(await getCourseRole(prisma, 1, { id: 1, role: 'ADMIN' })).toBe(
      'ADMIN',
    );
    prisma.courseStaff.findUnique.mockResolvedValue({ role: 'ASSISTANT' });
    expect(await getCourseRole(prisma, 1, { id: 9, role: 'STUDENT' })).toBe(
      'ASSISTANT',
    );
  });

  it('assertCourseRole: 404 for a missing course, 403 below the permission', async () => {
    prisma.course.findUnique.mockResolvedValueOnce(null);
    await expect(
      assertCourseRole(prisma, 99, { id: 7, role: 'TEACHER' }, 'view'),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.courseStaff.findUnique.mockResolvedValue({ role: 'ASSISTANT' });
    await expect(
      assertCourseRole(prisma, 1, { id: 9, role: 'STUDENT' }, 'content'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      assertCourseRole(prisma, 1, { id: 9, role: 'STUDENT' }, 'grade'),
    ).resolves.toMatchObject({ role: 'ASSISTANT' });

    prisma.courseStaff.findUnique.mockResolvedValue(null);
    await expect(
      assertCourseRole(prisma, 1, { id: 8, role: 'TEACHER' }, 'view'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('team ids always include the owner and dedupe', async () => {
    prisma.courseStaff.findMany.mockResolvedValue([
      { userId: 7 },
      { userId: 8 },
    ]);
    expect(
      (await courseStaffIds(prisma, { id: 1, teacherId: 7 })).sort(),
    ).toEqual([7, 8]);
  });
});
