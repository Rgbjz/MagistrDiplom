'use client';

import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../lib/api/client';
import type { AdaptiveMe } from '../../lib/types';
import { Skeleton } from '../ui';
import { RecommendationList } from './RecommendationList';
import styles from './adaptive.module.scss';

/**
 * Student course page: mastery of each topic (learner model) and the top
 * personal recommendations. Hidden when the course has adaptation off.
 */
export function MasteryPanel({ courseId }: { courseId: number }) {
  const t = useTranslations('adaptive');
  const { data, isLoading } = useQuery({
    queryKey: ['adaptive-me', courseId],
    queryFn: () => clientApi<AdaptiveMe>(`/courses/${courseId}/adaptive/me`),
    retry: false,
  });

  if (isLoading) return <Skeleton height={180} radius="var(--radius-lg)" />;
  if (!data || !data.enabled) return null;

  const known = data.sections.filter((s) => s.evidence > 0);
  return (
    <section className={styles.panel} aria-labelledby="mastery-title">
      <h2 id="mastery-title" className={styles.panelTitle}>
        <Sparkles size={18} aria-hidden="true" />
        {t('panel.title')}
      </h2>
      {known.length === 0 ? (
        <p className={styles.muted}>{t('panel.empty')}</p>
      ) : (
        <>
          <p className={styles.muted}>{t('panel.hint')}</p>
          <ul className={styles.bars}>
            {data.sections.map((s) => {
              const value = Math.round(s.mastery * 100);
              const level = t(`panel.level.${s.level}`);
              return (
                <li
                  key={s.id}
                  className={styles.bar}
                  data-level={s.level}
                  aria-label={t('panel.masteryOf', { section: s.title, value, level })}
                >
                  <span className={styles.barHead}>
                    <span className={styles.barTitle}>{s.title}</span>
                    <span className={styles.barValue}>{s.evidence > 0 ? `${value}%` : '—'}</span>
                  </span>
                  <span className={styles.track} aria-hidden="true">
                    <span style={{ width: `${s.evidence > 0 ? value : 0}%` }} />
                  </span>
                  <span className={styles.barLevel}>{level}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {data.group === 'CONTROL' ? (
        <p className={styles.note}>{t('panel.control')}</p>
      ) : (
        data.recommendations.length > 0 && (
          <>
            <h3 className={styles.subTitle}>{t('recs.title')}</h3>
            <RecommendationList items={data.recommendations.slice(0, 3)} courseId={courseId} compact />
          </>
        )
      )}
    </section>
  );
}
