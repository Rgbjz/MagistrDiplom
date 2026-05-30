'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../lib/api/client';
import type { EnrollRequest } from '../../lib/types';
import styles from './EnrollRequests.module.scss';

export function EnrollRequests({ courseId }: { courseId: number }) {
  const queryClient = useQueryClient();
  const { data: requests } = useQuery<EnrollRequest[]>({
    queryKey: ['enrollRequests', courseId],
    queryFn: () =>
      clientApi<EnrollRequest[]>(
        `/courses/${courseId}/enrollments?status=PENDING`,
      ),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['enrollRequests', courseId] });
    queryClient.invalidateQueries({ queryKey: ['studentsProgress', courseId] });
  };

  const approve = useMutation({
    mutationFn: (userId: number) =>
      clientApi(`/courses/${courseId}/enroll/${userId}/approve`, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: (userId: number) =>
      clientApi(`/courses/${courseId}/enroll/${userId}/reject`, {
        method: 'POST',
      }),
    onSuccess: invalidate,
  });

  if (!requests) return <p className={styles.muted}>Loading…</p>;
  if (requests.length === 0)
    return <p className={styles.muted}>No pending requests.</p>;

  return (
    <div className={styles.list}>
      {requests.map((r) => {
        const p = r.student.profile;
        const name =
          p && (p.firstName || p.lastName)
            ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()
            : r.student.email;
        return (
          <div key={r.id} className={styles.card}>
            <div>
              <div className={styles.name}>{name}</div>
              <div className={styles.email}>{r.student.email}</div>
            </div>
            <div className={styles.actions}>
              <button
                className={styles.approve}
                onClick={() => approve.mutate(r.userId)}
              >
                Approve
              </button>
              <button
                className={styles.reject}
                onClick={() => reject.mutate(r.userId)}
              >
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
