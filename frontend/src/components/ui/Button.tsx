import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.scss';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  loading = false,
  size = 'md',
  block = false,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      className={`${styles.btn} ${styles[variant]} ${size !== 'md' ? styles[size] : ''} ${block ? styles.block : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className={styles.spinner} />}
      {children}
    </button>
  );
}
