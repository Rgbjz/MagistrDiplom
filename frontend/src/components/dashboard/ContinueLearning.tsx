import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { Card, Button, EmptyState } from '../ui';
import type { ContinueCourse } from '../../lib/types';
import styles from '../../app/(app)/dashboard.module.scss';

export function ContinueLearning({ courses }: { courses: ContinueCourse[] }) {
  if (courses.length === 0) {
    return (
      <EmptyState
        icon={<GraduationCap size={28} />}
        title="No courses in progress yet"
      >
        <span>Enroll in a course below to get started.</span>
      </EmptyState>
    );
  }
  return (
    <div className={styles.continueGrid}>
      {courses.map((c) => (
        <Card key={c.id} className={styles.continueCard}>
          <div className={styles.continueTitle}>{c.title}</div>
          <div className={styles.bar}>
            <div className={styles.barFill} style={{ width: `${c.percent}%` }} />
          </div>
          <div className={styles.continueRow}>
            <span className={styles.percent}>{c.percent}%</span>
            <Link href={`/courses/${c.id}`}>
              <Button variant="primary">Continue</Button>
            </Link>
          </div>
        </Card>
      ))}
    </div>
  );
}
