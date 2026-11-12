import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Course, CourseStaffRole } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../decorators/current-user.decorator';

/** A user's role in one course; ADMIN is the platform administrator. */
export type CourseRole = CourseStaffRole | 'ADMIN';

/**
 * What a course role may do:
 * - view    — see the course, student progress, test results, gradebook (+ export);
 * - manage  — approve/reject enrollment requests, course chat;
 * - grade   — grade/return assignment submissions;
 * - content — edit sections, lessons, files, videos, tests, assignments, publish;
 * - owner   — price, delete the course, manage the team.
 */
export type CoursePermission =
  | 'view'
  | 'manage'
  | 'grade'
  | 'content'
  | 'owner';

const MATRIX: Record<CourseStaffRole, ReadonlySet<CoursePermission>> = {
  OWNER: new Set(['view', 'manage', 'grade', 'content', 'owner']),
  TEACHER: new Set(['view', 'manage', 'grade', 'content']),
  ASSISTANT: new Set(['view', 'manage', 'grade']),
};

export function can(
  role: CourseRole | null,
  permission: CoursePermission,
): boolean {
  if (!role) return false;
  if (role === 'ADMIN') return true;
  return MATRIX[role].has(permission);
}

type Db = Pick<PrismaService, 'course' | 'courseStaff'>;

/** Role from an already-loaded course (owner via teacherId) plus a staff lookup. */
async function roleFor(
  prisma: Db,
  course: Pick<Course, 'id' | 'teacherId'>,
  user: Pick<AuthUser, 'id' | 'role'>,
): Promise<CourseRole | null> {
  if (user.role === 'ADMIN') return 'ADMIN';
  if (course.teacherId === user.id) return 'OWNER';
  const staff = await prisma.courseStaff.findUnique({
    where: { courseId_userId: { courseId: course.id, userId: user.id } },
    select: { role: true },
  });
  return staff?.role ?? null;
}

/** The user's role in the course, or null when they're not on its team. */
export async function getCourseRole(
  prisma: Db,
  courseId: number,
  user: Pick<AuthUser, 'id' | 'role'>,
): Promise<CourseRole | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, teacherId: true },
  });
  if (!course) return null;
  return roleFor(prisma, course, user);
}

/**
 * Loads the course and throws 404 / 403 unless the user's course role grants
 * `permission`. Returns the course and the role.
 */
export async function assertCourseRole(
  prisma: Db,
  courseId: number,
  user: Pick<AuthUser, 'id' | 'role'>,
  permission: CoursePermission,
): Promise<{ course: Course; role: CourseRole }> {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    throw new NotFoundException('Course not found');
  }
  const role = await roleFor(prisma, course, user);
  if (!can(role, permission)) {
    throw new ForbiddenException('Not your course');
  }
  return { course, role: role! };
}

/** Same check when the caller already has { id, teacherId } of the course. */
export async function assertRoleOnCourse(
  prisma: Db,
  course: Pick<Course, 'id' | 'teacherId'>,
  user: Pick<AuthUser, 'id' | 'role'>,
  permission: CoursePermission,
): Promise<CourseRole> {
  const role = await roleFor(prisma, course, user);
  if (!can(role, permission)) {
    throw new ForbiddenException('Not your course');
  }
  return role!;
}

/** User ids of the course team with the given roles (owner always included for OWNER). */
export async function courseStaffIds(
  prisma: Db,
  course: Pick<Course, 'id' | 'teacherId'>,
  roles: CourseStaffRole[] = ['OWNER', 'TEACHER', 'ASSISTANT'],
): Promise<number[]> {
  const rows = await prisma.courseStaff.findMany({
    where: { courseId: course.id, role: { in: roles } },
    select: { userId: true },
  });
  const ids = new Set(rows.map((r) => r.userId));
  if (roles.includes('OWNER')) ids.add(course.teacherId);
  return [...ids];
}

/** Prisma filter for courses where `userId` is on the team (any role). */
export function staffCourseWhere(userId: number) {
  return {
    OR: [{ teacherId: userId }, { staff: { some: { userId } } }],
  };
}
