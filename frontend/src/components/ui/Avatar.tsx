import styles from './Avatar.module.scss';

export function Avatar({
  src,
  name,
  size = 36,
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
}) {
  const initial = (name ?? '?').charAt(0).toUpperCase();
  return (
    <span className={styles.avatar} style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ?? 'avatar'} />
      ) : (
        <span style={{ fontSize: size * 0.42 }}>{initial}</span>
      )}
    </span>
  );
}
