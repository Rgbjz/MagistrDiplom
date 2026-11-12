import type { CourseRole } from './types';

/** Mirrors backend common/access/course-access.ts — keep the two in sync. */
export type CoursePermission = 'view' | 'manage' | 'grade' | 'content' | 'owner';

const MATRIX: Record<Exclude<CourseRole, 'ADMIN'>, CoursePermission[]> = {
  OWNER: ['view', 'manage', 'grade', 'content', 'owner'],
  TEACHER: ['view', 'manage', 'grade', 'content'],
  ASSISTANT: ['view', 'manage', 'grade'],
};

export function canCourse(
  role: CourseRole | null | undefined,
  permission: CoursePermission,
): boolean {
  if (!role) return false;
  if (role === 'ADMIN') return true;
  return MATRIX[role].includes(permission);
}
