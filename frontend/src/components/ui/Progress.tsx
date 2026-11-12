import { useTranslations } from 'next-intl';
import styles from './Progress.module.scss';

/** Thin progress bar with an optional percentage label. */
export function Progress({
  value,
  label,
  showValue = false,
  size = 'md',
}: {
  value: number;
  label?: string;
  showValue?: boolean;
  size?: 'sm' | 'md';
}) {
  const t = useTranslations('common');
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={styles.row}>
      <div
        role="progressbar"
        aria-label={label ?? t('progress')}
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
        className={`${styles.track} ${size === 'sm' ? styles.sm : ''}`}
      >
        <div className={styles.fill} style={{ width: `${v}%` }} />
      </div>
      {showValue && <span className={styles.value}>{v}%</span>}
    </div>
  );
}
