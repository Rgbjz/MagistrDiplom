import styles from './ProgressBar.module.scss';

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.label}>
        Progress: <strong>{value}%</strong>
      </div>
      <div className={styles.bar}>
        <div className={styles.fill} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
