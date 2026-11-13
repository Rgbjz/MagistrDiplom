'use client';

import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../lib/api/client';
import type { AdaptiveRecommendation } from '../../lib/types';
import { Skeleton } from '../ui';
import { RecommendationList } from './RecommendationList';
import styles from './adaptive.module.scss';

/** Student dashboard: the top personal recommendations across courses. */
export function DashboardRecommendations() {
  const t = useTranslations('adaptive.recs');
  const { data, isLoading } = useQuery({
    queryKey: ['adaptive-dashboard'],
    queryFn: () => clientApi<AdaptiveRecommendation[]>('/adaptive/recommendations'),
    retry: false,
  });
  if (isLoading) return <Skeleton height={140} radius="var(--radius-lg)" />;
  if (!data?.length) return null;
  return (
    <section className={styles.dashboard} aria-labelledby="recs-title">
      <h2 id="recs-title" className={styles.dashboardTitle}>
        <Sparkles size={20} aria-hidden="true" />
        {t('title')}
      </h2>
      <RecommendationList items={data} showCourse />
    </section>
  );
}
