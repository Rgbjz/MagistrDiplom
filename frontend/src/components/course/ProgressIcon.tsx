import styles from './ProgressIcon.module.scss';

export function ProgressIcon({ completed }: { completed: boolean }) {
  return (
    <span
      className={`${styles.icon} ${completed ? styles.done : styles.pending}`}
    >
      ✓
    </span>
  );
}
