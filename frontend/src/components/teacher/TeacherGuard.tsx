'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

export function TeacherGuard({
  children,
  allowAdmin = true,
}: {
  children: ReactNode;
  allowAdmin?: boolean;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = session?.user.role;
  const ok = role === 'TEACHER' || (allowAdmin && role === 'ADMIN');

  useEffect(() => {
    if (status === 'authenticated' && !ok) router.replace('/');
  }, [status, ok, router]);

  if (status !== 'authenticated') return null;
  if (!ok) return null;
  return <>{children}</>;
}
