'use client';

import { useSession } from 'next-auth/react';
import type { SessionUser } from '../../lib/types';
import { StudentDashboard } from '../../components/dashboard/student/StudentDashboard';
import { TeacherDashboard } from '../../components/teacher/dashboard/TeacherDashboard';

export default function DashboardPage() {
  const { data: session } = useSession();
  if (!session) return null;
  const user = session.user as SessionUser;
  // ADMIN is redirected to /admin by middleware.
  return user.role === 'TEACHER' ? (
    <TeacherDashboard user={user} />
  ) : (
    <StudentDashboard user={user} />
  );
}
