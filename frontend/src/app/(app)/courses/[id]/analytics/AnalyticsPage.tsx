'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../../../../lib/api/client';
import { canCourse } from '../../../../../lib/courseRole';
import type { CourseDetail } from '../../../../../lib/types';
import { PageHeader } from '../../../../../components/ui';
import { AnalyticsView } from '../../../../../components/analytics/AnalyticsView';
import styles from './analytics.module.scss';

export function AnalyticsPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const t = useTranslations('analytics');
  // Only for the title and the builder link; access is checked by the API.
  const { data: course } = useQuery<CourseDetail>({
    queryKey: ['course', id],
    queryFn: () => clientApi<CourseDetail>(`/courses/${id}`),
  });

  return (
    <div className={`container ${styles.page}`}>
      <Link href={`/courses/${id}/manage`} className={styles.back}>
        <ChevronLeft size={18} aria-hidden="true" /> {t('back')}
      </Link>
      <PageHeader eyebrow={course?.title} title={t('title')} subtitle={t('subtitle')} />
      <AnalyticsView courseId={id} canEdit={canCourse(course?.myRole ?? null, 'content')} />
    </div>
  );
}
