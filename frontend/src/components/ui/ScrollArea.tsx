import type { HTMLAttributes, ReactNode } from 'react';
import { useTranslations } from 'next-intl';

/**
 * A box that may scroll (wide tables, code): focusable and named so keyboard
 * users can scroll it too (WCAG 2.1.1, axe `scrollable-region-focusable`).
 */
export function ScrollArea({
  label,
  children,
  style,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { label?: string; children: ReactNode }) {
  const t = useTranslations('common.a11y');
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={label ?? t('scrollTable')}
      // Positioned, so absolutely placed children (sr-only labels in cells)
      // are clipped by the scroll box instead of widening the page.
      style={{ position: 'relative', ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
