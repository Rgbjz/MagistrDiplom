'use client';

import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { clientApi } from '../../../../../lib/api/client';
import type {
  CourseDetail,
  SessionUser,
  StudentProgress,
} from '../../../../../lib/types';
import { EnrollRequests } from '../../../../../components/teacher/EnrollRequests';
import styles from './management.module.scss';

export function ManagementView() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data: session } = useSession();

  const { data: course } = useQuery<CourseDetail>({
    queryKey: ['course', id],
    queryFn: () => clientApi<CourseDetail>(`/courses/${id}`),
  });
  const { data: students } = useQuery<StudentProgress[]>({
    queryKey: ['studentsProgress', id],
    queryFn: () =>
      clientApi<StudentProgress[]>(`/courses/${id}/students/progress`),
    enabled: !!course,
  });

  if (!session || !course) return <p className={styles.page}>Loading…</p>;
  const user = session.user as SessionUser;
  if (user.id !== course.teacherId && user.role !== 'ADMIN') {
    return <p className={styles.noAccess}>No access</p>;
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Course management</h1>
      <p className={styles.subtitle}>{course.title}</p>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Enrollment requests</h2>
        <EnrollRequests courseId={id} />
      </section>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Students</h2>
        <div className={styles.studentsList}>
          {(students ?? []).map((s) => {
            const total = s.lessons.total + s.tests.total;
            const done = s.lessons.completed + s.tests.completed;
            const percent = total ? Math.round((done / total) * 100) : 0;
            const completed = total > 0 && done === total;
            return (
              <div key={s.userId} className={styles.studentCard}>
                <div className={styles.studentHeader}>
                  <div>
                    <div className={styles.studentName}>{s.name}</div>
                    <div className={styles.studentEmail}>{s.email}</div>
                  </div>
                  <div
                    className={`${styles.status} ${
                      completed ? styles.completed : styles.inProgress
                    }`}
                  >
                    {completed ? 'Completed' : 'In progress'}
                  </div>
                </div>
                <div className={styles.progress}>
                  <div className={styles.progressRow}>
                    <span>Lessons</span>
                    <span>
                      {s.lessons.completed} / {s.lessons.total}
                    </span>
                  </div>
                  <div className={styles.progressRow}>
                    <span>Tests</span>
                    <span>
                      {s.tests.completed} / {s.tests.total}
                    </span>
                  </div>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className={styles.progressPercent}>{percent}%</div>
                </div>
              </div>
            );
          })}
          {(students ?? []).length === 0 && (
            <p style={{ color: '#6b7280' }}>No active students yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
