import type { ReactNode } from 'react';
import styles from './Badge.module.scss';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'primary';

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
