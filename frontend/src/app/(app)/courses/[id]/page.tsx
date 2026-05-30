'use client';

import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { clientApi } from '../../../../lib/api/client';
import type { ActiveItem, CourseDetail, SessionUser } from '../../../../lib/types';
import { StructurePanel } from '../../../../components/course/StructurePanel';
import { ViewerPanel } from '../../../../components/course/ViewerPanel';
import styles from './course.module.scss';

export default function CoursePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data: session } = useSession();
  const [active, setActive] = useState<ActiveItem>(null);

  const { data: course, isLoading, isError, error } = useQuery<CourseDetail>({
    queryKey: ['course', id],
    queryFn: () => clientApi<CourseDetail>(`/courses/${id}`),
  });

  if (!session) return null;
  const user = session.user as SessionUser;

  if (isLoading) return <p className={styles.state}>Loading…</p>;
  if (isError)
    return (
      <p className={styles.state}>
        {String((error as Error).message).includes('403')
          ? 'You are not enrolled in this course.'
          : 'Failed to load course.'}
      </p>
    );
  if (!course) return null;

  return (
    <div className={styles.page}>
      <StructurePanel
        course={course}
        user={user}
        active={active}
        onSelect={setActive}
      />
      <div className={styles.content}>
        <div className={styles.header}>
          <h1>{course.title}</h1>
          <p>{course.description}</p>
        </div>
        <ViewerPanel active={active} course={course} user={user} />
      </div>
    </div>
  );
}
