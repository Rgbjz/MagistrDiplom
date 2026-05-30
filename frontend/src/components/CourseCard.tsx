'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { clientApi } from '../lib/api/client';
import type { CourseListItem, SessionUser } from '../lib/types';
import styles from './CourseCard.module.scss';

const ASSET_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api'
).replace(/\/api$/, '');

export function CourseCard({
  course,
  user,
}: {
  course: CourseListItem;
  user: SessionUser;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const imageSrc = course.imageUrl
    ? course.imageUrl.startsWith('/public')
      ? `${ASSET_BASE}${course.imageUrl}`
      : course.imageUrl
    : null;

  async function enroll() {
    setBusy(true);
    try {
      await clientApi(`/courses/${course.id}/enroll`, { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.image}>
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageSrc} alt={course.title} />
        ) : (
          <div className={styles.placeholder} />
        )}
      </div>
      <div className={styles.content}>
        <h3>{course.title}</h3>
        <p>{course.description}</p>
        <div className={styles.actions}>{renderActions()}</div>
      </div>
    </div>
  );

  function renderActions() {
    if (user.role === 'STUDENT') {
      if (course.enrollmentStatus === 'ACTIVE') {
        return (
          <Link
            className={`${styles.btn} ${styles.btnPrimary}`}
            href={`/courses/${course.id}`}
          >
            Open
          </Link>
        );
      }
      if (course.enrollmentStatus === 'PENDING') {
        return (
          <button className={`${styles.btn} ${styles.btnDisabled}`} disabled>
            Pending
          </button>
        );
      }
      return (
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={enroll}
          disabled={busy}
        >
          {busy ? '…' : 'Enroll'}
        </button>
      );
    }
    const canEdit = user.role === 'ADMIN' || user.id === course.teacherId;
    return (
      <>
        <Link
          className={`${styles.btn} ${styles.btnOutline}`}
          href={`/courses/${course.id}`}
        >
          View
        </Link>
        {canEdit && (
          <Link
            className={`${styles.btn} ${styles.btnOutline}`}
            href={`/teacher/courses/${course.id}/builder`}
          >
            Edit
          </Link>
        )}
      </>
    );
  }
}
