import type { ReactNode } from 'react';
import styles from './PageHeader.module.scss';

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}

export function StatCard({
  icon,
  value,
  label,
  tone = 'primary',
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  tone?: 'primary' | 'success' | 'warning';
}) {
  return (
    <div className={styles.stat}>
      <span className={`${styles.statIcon} ${styles[tone]}`}>{icon}</span>
      <div className={styles.statText}>
        <span className={styles.statValue}>{value}</span>
        <span className={styles.statLabel}>{label}</span>
      </div>
    </div>
  );
}

/** Flat tinted course cover used when a course has no image. */
export function CourseCover({
  id,
  imageUrl,
  title,
  height = 132,
  children,
}: {
  id: number;
  imageUrl?: string | null;
  title: string;
  height?: number | string;
  children?: ReactNode;
}) {
  const tone = (id % 4) + 1;
  return (
    <div
      className={styles.cover}
      style={{
        height,
        // One shorthand: a separate `background` here would reset the
        // stylesheet's background-size/position and show the picture's corner.
        background: imageUrl
          ? `center / cover no-repeat url("${imageUrl}"), var(--cover-${tone})`
          : `var(--cover-${tone})`,
        color: `var(--cover-${tone}-ink)`,
      }}
    >
      {!imageUrl && (
        <span className={styles.coverLetter} aria-hidden="true">
          {title.trim().charAt(0).toUpperCase()}
        </span>
      )}
      {children}
    </div>
  );
}
