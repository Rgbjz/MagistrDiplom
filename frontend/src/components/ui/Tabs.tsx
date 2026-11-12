'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './Tabs.module.scss';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

/** Underlined tab strip. Content switching is up to the caller. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Which edges hide more tabs — shown as a fade so a cut-off strip reads as scrollable.
  const [more, setMore] = useState({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setMore({
        start: el.scrollLeft > 2,
        end: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
      });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [items.length]);

  // Keep the selected tab visible on narrow screens.
  useEffect(() => {
    const el = ref.current;
    const active = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el || !active) return;
    // Horizontal only — scrollIntoView would also move the page.
    const left = active.offsetLeft - el.offsetLeft;
    if (left < el.scrollLeft) el.scrollLeft = left;
    else if (left + active.offsetWidth > el.scrollLeft + el.clientWidth)
      el.scrollLeft = left + active.offsetWidth - el.clientWidth;
  }, [value]);

  return (
    <div
      className={`${styles.tabsWrap} ${more.start ? styles.moreStart : ''} ${more.end ? styles.moreEnd : ''}`}
    >
      <div ref={ref} role="tablist" aria-label={label} className={styles.tabs}>
        {items.map((t) => (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={t.value === value}
            className={`${styles.tab} ${t.value === value ? styles.active : ''}`}
            onClick={() => onChange(t.value)}
          >
            {t.label}
            {t.count !== undefined && <span className={styles.count}>{t.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Pill-shaped segmented control (filters, theme switch). */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className={styles.segmented}>
      {items.map((t) => (
        <button
          key={t.value}
          type="button"
          aria-pressed={t.value === value}
          className={`${styles.segment} ${t.value === value ? styles.segmentActive : ''}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
