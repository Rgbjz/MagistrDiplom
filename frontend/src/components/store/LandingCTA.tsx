'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../lib/api/client';
import { useApiErrorMessage, useFormat } from '../../i18n/format';
import type { MyStatus, SessionUser } from '../../lib/types';
import { Button, useToast } from '../ui';
import { track } from '../../lib/analytics';
import styles from './LandingCTA.module.scss';

function fetchMyStatus(courseId: number): Promise<MyStatus> {
  return clientApi<MyStatus>(`/store/courses/${courseId}/my-status`);
}

export function LandingCTA({
  courseId,
  title,
  price,
  autoApprove,
}: {
  courseId: number;
  title: string;
  price: number;
  autoApprove: boolean;
}) {
  const t = useTranslations('landing.cta');
  const f = useFormat();
  const errorText = useApiErrorMessage();
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const user = session?.user as SessionUser | undefined;

  const { data: my, isLoading } = useQuery<MyStatus>({
    queryKey: ['my-status', courseId],
    queryFn: () => fetchMyStatus(courseId),
    enabled: user?.role === 'STUDENT',
  });

  useEffect(() => {
    track('view_item', {
      currency: 'UAH',
      value: price,
      items: [{ item_id: String(courseId), item_name: title, price }],
    });
  }, [courseId, title, price]);

  if (status === 'loading' || (user?.role === 'STUDENT' && isLoading)) {
    return <div className={styles.placeholder} aria-hidden="true" />;
  }

  if (!user) {
    const next = encodeURIComponent(`/c/${courseId}`);
    return (
      <div className={styles.stack}>
        <Link href={`/register?next=${next}`} className={styles.primary}>
          {price > 0 ? t('buy') : t('enroll')}
        </Link>
        <p className={styles.note}>
          {t('hasAccount')} <Link href={`/login?next=${next}`}>{t('login')}</Link>
        </p>
      </div>
    );
  }

  if (user.role !== 'STUDENT') {
    return (
      <p className={styles.note}>
        {t('notStudent', { role: user.role === 'ADMIN' ? t('roleAdmin') : t('roleTeacher') })}
      </p>
    );
  }

  const enrollment = my?.enrollmentStatus ?? null;

  if (enrollment === 'ACTIVE' || enrollment === 'COMPLETED') {
    return (
      <div className={styles.stack}>
        <Link href={`/courses/${courseId}`} className={styles.primary}>
          {t('goToCourse')}
        </Link>
        <p className={styles.note}>{t('alreadyOwned')}</p>
      </div>
    );
  }
  if (enrollment === 'PENDING') {
    return (
      <div className={styles.stack}>
        <Button size="lg" block disabled>
          {t('requestSent')}
        </Button>
        <p className={styles.note}>{t('requestPending')}</p>
      </div>
    );
  }

  if (price > 0) {
    return (
      <div className={styles.stack}>
        <Link href={`/checkout/${courseId}`} className={styles.primary}>
          {t('buyFor', { price: f.price(price) })}
        </Link>
        <p className={styles.note}>{t('afterPayment')}</p>
      </div>
    );
  }

  async function enroll() {
    setBusy(true);
    try {
      await clientApi(`/courses/${courseId}/enroll`, { method: 'POST' });
      track('generate_lead', {
        item_id: String(courseId),
        enrollment: autoApprove ? 'free' : 'request',
      });
      await queryClient.invalidateQueries({ queryKey: ['my-status', courseId] });
      toast(autoApprove ? t('enrolledToast') : t('requestToast'), 'success');
      if (autoApprove) router.push(`/courses/${courseId}`);
    } catch (err) {
      toast(errorText(err, t('enrollFailed')), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.stack}>
      <Button size="lg" block onClick={enroll} loading={busy}>
        {autoApprove ? t('startLearning') : t('sendRequest')}
      </Button>
      <p className={styles.note}>
        {enrollment === 'REJECTED'
          ? t('rejectedNote')
          : autoApprove
            ? t('instantAccess')
            : t('approvalAccess')}
      </p>
    </div>
  );
}
