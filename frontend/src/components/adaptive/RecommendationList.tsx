'use client';

import Link from 'next/link';
import { ArrowRight, BookOpenCheck, CalendarClock, FastForward, RotateCcw, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AdaptiveRecommendation, RecommendationType } from '../../lib/types';
import { logOpened, recommendationHref } from './recommendation';
import styles from './adaptive.module.scss';

const ICONS: Record<RecommendationType, typeof ArrowRight> = {
  REVIEW: BookOpenCheck,
  RETRY_TEST: RotateCcw,
  NEXT: ArrowRight,
  SKIP_AHEAD: FastForward,
  CHALLENGE: Trophy,
  DEADLINE: CalendarClock,
};

/**
 * Personal recommendations as a list of links. Each item says why it is
 * suggested (the explainable reason from the personalisation algorithm).
 */
export function RecommendationList({
  items,
  courseId,
  showCourse = false,
  compact = false,
}: {
  items: AdaptiveRecommendation[];
  courseId?: number;
  showCourse?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations('adaptive.recs');
  return (
    <ul className={styles.recs} data-compact={compact}>
      {items.map((r) => {
        const cid = r.courseId ?? courseId ?? 0;
        const Icon = ICONS[r.type];
        return (
          <li key={`${cid}-${r.key}`}>
            <Link
              href={recommendationHref(r, cid)}
              className={styles.rec}
              data-type={r.type}
              onClick={() => logOpened(r, cid)}
            >
              <span className={styles.recIcon} aria-hidden="true">
                <Icon size={18} />
              </span>
              <span className={styles.recBody}>
                <span className={styles.recType}>{t(`type.${r.type}`)}</span>
                <span className={styles.recText}>{t(`reason.${r.reason}`, r.params)}</span>
                {showCourse && r.courseTitle && (
                  <span className={styles.recCourse}>{t('course', { course: r.courseTitle })}</span>
                )}
              </span>
              <ArrowRight size={16} aria-hidden="true" className={styles.recArrow} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
