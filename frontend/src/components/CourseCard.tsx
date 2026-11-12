'use client';

import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../lib/api/client';
import { fileUrl } from '../lib/format';
import { useApiErrorMessage, useFormat, useLabels } from '../i18n/format';
import type { CourseListItem, SessionUser } from '../lib/types';
import { Button, CourseCover, useToast } from './ui';
import styles from './CourseCard.module.scss';
import { useCategoryLabel } from '../i18n/categories';

/** Course card for signed-in users: actions depend on role and enrollment. */
export function CourseCard({
  course,
  user,
}: {
  course: CourseListItem;
  user: SessionUser;
}) {
  const t = useTranslations('catalog.card');
  const categoryLabel = useCategoryLabel();
  const f = useFormat();
  const labels = useLabels();
  const errorText = useApiErrorMessage();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const status = course.enrollmentStatus ?? null;

  async function enroll() {
    setBusy(true);
    try {
      await clientApi(`/courses/${course.id}/enroll`, { method: 'POST' });
      toast(course.autoApprove ? t('enrolled') : t('requestSent'), 'success');
      await queryClient.invalidateQueries();
      router.refresh();
    } catch (err) {
      toast(errorText(err, t('enrollFailed')), 'error');
    } finally {
      setBusy(false);
    }
  }

  const badge =
    status === 'ACTIVE' || status === 'COMPLETED'
      ? { text: status === 'COMPLETED' ? t('completed') : t('learning'), cls: styles.badgeSuccess }
      : status === 'PENDING'
        ? { text: t('pending'), cls: styles.badgeWarning }
        : { text: f.price(course.price), cls: course.price > 0 ? styles.badgePrice : styles.badgeSuccess };

  return (
    <article className={styles.card}>
      <CourseCover id={course.id} imageUrl={fileUrl(course.imageUrl)} title={course.title}>
        <span className={`${styles.badge} ${badge.cls}`}>{badge.text}</span>
        {course.published === false && (
          <span className={`${styles.badge} ${styles.badgeDraft}`}>{t('draft')}</span>
        )}
      </CourseCover>
      <div className={styles.content}>
        {(course.category || course.level) && (
          <span className={styles.meta}>
            {[course.category ? categoryLabel(course.category) : null, course.level ? labels.level(course.level) : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
        <h3 className={styles.title}>
          <Link href={`/c/${course.id}`}>{course.title}</Link>
        </h3>
        {course.description && <p className={styles.description}>{course.description}</p>}
        <div className={styles.actions}>{renderActions()}</div>
      </div>
    </article>
  );

  function renderActions() {
    if (user.role === 'STUDENT') {
      if (status === 'ACTIVE' || status === 'COMPLETED') {
        return (
          <Link href={`/courses/${course.id}`} className={styles.primaryLink}>
            {t('openCourse')}
          </Link>
        );
      }
      if (status === 'PENDING') {
        return (
          <Button variant="outline" block disabled>
            {t('awaitingApproval')}
          </Button>
        );
      }
      if (course.price > 0) {
        return (
          <Link href={`/c/${course.id}`} className={styles.outlineLink}>
            {t('details')}
          </Link>
        );
      }
      return (
        <Button block onClick={enroll} loading={busy}>
          {t('enroll')}
        </Button>
      );
    }
    const canEdit = user.role === 'ADMIN' || user.id === course.teacherId;
    return (
      <>
        <Link href={`/c/${course.id}`} className={styles.outlineLink}>
          {t('view')}
        </Link>
        {canEdit && (
          <Link href={`/teacher/courses/${course.id}/builder`} className={styles.outlineLink}>
            {t('edit')}
          </Link>
        )}
      </>
    );
  }
}
