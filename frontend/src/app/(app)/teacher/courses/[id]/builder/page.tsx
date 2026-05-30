'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { clientApi } from '../../../../../../lib/api/client';
import type { ActiveItem, CourseDetail } from '../../../../../../lib/types';
import { TeacherGuard } from '../../../../../../components/teacher/TeacherGuard';
import { BuilderStructurePanel } from '../../../../../../components/teacher/BuilderStructurePanel';
import { BuilderEditorPanel } from '../../../../../../components/teacher/BuilderEditorPanel';
import styles from './builder.module.scss';

function Builder() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [active, setActive] = useState<ActiveItem>(null);

  const { data: course, isLoading } = useQuery<CourseDetail>({
    queryKey: ['course', id],
    queryFn: () => clientApi<CourseDetail>(`/courses/${id}`),
  });

  if (isLoading) return <p className={styles.state}>Loading…</p>;
  if (!course) return <p className={styles.state}>Course not found.</p>;

  return (
    <div className={styles.builder}>
      <BuilderStructurePanel
        course={course}
        active={active}
        onSelect={setActive}
      />
      <div className={styles.right}>
        <BuilderEditorPanel
          active={active}
          course={course}
          onTestDeleted={() => setActive(null)}
        />
      </div>
    </div>
  );
}

export default function CourseBuilderPage() {
  return (
    <TeacherGuard>
      <Builder />
    </TeacherGuard>
  );
}
