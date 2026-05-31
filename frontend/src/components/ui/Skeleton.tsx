import styles from './Skeleton.module.scss';

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 'var(--radius-sm)',
}: {
  width?: number | string;
  height?: number | string;
  radius?: string;
}) {
  return (
    <span
      className={styles.skeleton}
      style={{ width, height, borderRadius: radius }}
    />
  );
}
