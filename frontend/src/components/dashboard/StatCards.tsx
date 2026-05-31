import { Card } from '../ui';
import type { DashboardStats } from '../../lib/types';
import styles from '../../app/(app)/dashboard.module.scss';

export function StatCards({ stats }: { stats: DashboardStats }) {
  const items = [
    { label: 'Enrolled', value: stats.enrolled },
    { label: 'Completed', value: stats.completed },
    { label: 'Lessons done', value: stats.lessonsCompleted },
    {
      label: 'Avg score',
      value: stats.avgScore === null ? '—' : `${stats.avgScore}%`,
    },
  ];
  return (
    <div className={styles.stats}>
      {items.map((it) => (
        <Card key={it.label} className={styles.stat}>
          <div className={styles.statValue}>{it.value}</div>
          <div className={styles.statLabel}>{it.label}</div>
        </Card>
      ))}
    </div>
  );
}
