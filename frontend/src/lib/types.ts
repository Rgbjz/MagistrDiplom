export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';
export type EnrollmentStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'COMPLETED';

export interface SessionUser {
  id: number;
  email: string;
  role: Role;
}

export interface CourseListItem {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  teacherId: number;
  enrollmentStatus?: EnrollmentStatus | null;
}
