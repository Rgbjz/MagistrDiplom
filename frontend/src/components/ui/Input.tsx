import type { ComponentProps, ReactNode } from 'react';
import styles from './Input.module.scss';

// ComponentProps includes `ref` (React 19 passes it as a prop), so these work with react-hook-form's register().
export function Input(props: ComponentProps<'input'>) {
  const { className = '', ...rest } = props;
  return <input className={`${styles.field} ${className}`} {...rest} />;
}

export function Textarea(props: ComponentProps<'textarea'>) {
  const { className = '', ...rest } = props;
  return <textarea className={`${styles.field} ${className}`} {...rest} />;
}

export function Select(
  props: ComponentProps<'select'> & { children: ReactNode },
) {
  const { className = '', children, ...rest } = props;
  return (
    <select className={`${styles.field} ${className}`} {...rest}>
      {children}
    </select>
  );
}

/** Label wrapper with optional hint and error text under the control. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className={styles.label}>
      {label}
      {children}
      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : (
        hint && <span className={styles.hint}>{hint}</span>
      )}
    </label>
  );
}
