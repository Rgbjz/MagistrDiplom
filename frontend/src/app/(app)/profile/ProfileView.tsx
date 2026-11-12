'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../../lib/api/client';
import type { Me, MyCourse } from '../../../lib/types';
import { PageHeader, Skeleton } from '../../../components/ui';
import { ProfileSidebar } from './ProfileSidebar';
import { PersonalForm } from './PersonalForm';
import { SecuritySection } from './SecuritySection';
import { SettingsSection } from './SettingsSection';
import { DangerZone } from './DangerZone';
import styles from './profile.module.scss';

export function ProfileView() {
  const t = useTranslations('profile');
  const { data: me, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => clientApi<Me>('/users/me'),
  });
  const { data: courses } = useQuery({
    queryKey: ['my-courses'],
    queryFn: () => clientApi<MyCourse[]>('/users/me/courses'),
    enabled: me?.role === 'STUDENT',
  });

  return (
    <div className="container">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
      />
      {isLoading || !me ? (
        <div className={styles.layout}>
          <Skeleton height={360} radius="var(--radius-lg)" />
          <Skeleton height={520} radius="var(--radius-lg)" />
        </div>
      ) : (
        <div className={styles.layout}>
          <ProfileSidebar me={me} courses={courses} />
          <div className={styles.sections}>
            <PersonalForm me={me} />
            <SecuritySection />
            <SettingsSection me={me} />
            <DangerZone />
          </div>
        </div>
      )}
    </div>
  );
}
