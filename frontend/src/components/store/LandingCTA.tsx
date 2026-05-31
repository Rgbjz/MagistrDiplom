'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { clientApi } from '../../lib/api/client';
import { useToast, Button } from '../ui';
import type { MyStatus } from '../../lib/types';

export function LandingCTA({
  courseId,
  price,
}: {
  courseId: number;
  price: number;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const { data: my } = useQuery<MyStatus>({
    queryKey: ['my-status', courseId],
    queryFn: () => clientApi<MyStatus>(`/courses/${courseId}/my-status`),
    enabled: status === 'authenticated',
  });

  if (status === 'loading') return null;

  if (!session) {
    return (
      <Link href="/login">
        <Button variant="primary">Log in to continue</Button>
      </Link>
    );
  }

  const enrollment = my?.enrollmentStatus ?? null;

  if (enrollment === 'ACTIVE') {
    return (
      <Link href={`/courses/${courseId}`}>
        <Button variant="primary">Go to course</Button>
      </Link>
    );
  }
  if (enrollment === 'PENDING') {
    return (
      <Button variant="ghost" disabled>
        Request pending
      </Button>
    );
  }

  if (price > 0) {
    return (
      <Button
        variant="primary"
        onClick={() => router.push(`/checkout/${courseId}`)}
      >
        Buy for ${price}
      </Button>
    );
  }

  // free → request enrollment
  async function enroll() {
    setBusy(true);
    try {
      await clientApi(`/courses/${courseId}/enroll`, { method: 'POST' });
      toast('Enrollment request sent', 'success');
      router.refresh();
    } catch {
      toast('Could not enroll', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="primary" onClick={enroll} loading={busy}>
      Enroll
    </Button>
  );
}
