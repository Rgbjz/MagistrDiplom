import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import btn from '../ui/Button.module.scss';

/** A next/link styled like <Button> — avoids nesting a button inside a link. */
export function LinkButton({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ComponentProps<typeof Link> & {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}) {
  return (
    <Link
      className={`${btn.btn} ${btn[variant]} ${size !== 'md' ? btn[size] : ''} ${className}`}
      {...rest}
    >
      {children}
    </Link>
  );
}
