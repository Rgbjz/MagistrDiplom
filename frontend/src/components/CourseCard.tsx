'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { clientApi } from '../lib/api/client';
import type { CourseListItem, SessionUser } from '../lib/types';
import { Button, Badge } from './ui';
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
          <div className={styles.gradient}>{course.title.charAt(0)}</div>
        )}
        <span className={styles.statusBadge}>
          <Badge tone={course.price > 0 ? 'primary' : 'neutral'}>
            {course.price > 0 ? `$${course.price}` : 'Free'}
          </Badge>
        </span>
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
          <Link href={`/courses/${course.id}`}>
            <Button variant="primary">Open</Button>
          </Link>
        );
      }
      if (course.enrollmentStatus === 'PENDING') {
        return (
          <Button variant="ghost" disabled>
            Pending
          </Button>
        );
      }
      if (course.price > 0) {
        return (
          <Link href={`/c/${course.id}`}>
            <Button variant="primary">Buy ${course.price}</Button>
          </Link>
        );
      }
      return (
        <Button variant="primary" onClick={enroll} loading={busy}>
          Enroll
        </Button>
      );
    }
    const canEdit = user.role === 'ADMIN' || user.id === course.teacherId;
    return (
      <>
        <Link href={`/courses/${course.id}`}>
          <Button variant="outline">View</Button>
        </Link>
        {canEdit && (
          <Link href={`/teacher/courses/${course.id}/builder`}>
            <Button variant="outline">Edit</Button>
          </Link>
        )}
      </>
    );
  }
}
