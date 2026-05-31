'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { clientApi } from '../../../lib/api/client';
import type { Purchase } from '../../../lib/types';
import { EmptyState } from '../../../components/ui';
import styles from './purchases.module.scss';

export default function PurchasesPage() {
  const { data: purchases } = useQuery<Purchase[]>({
    queryKey: ['purchases'],
    queryFn: () => clientApi<Purchase[]>('/me/purchases'),
  });

  return (
    <div className={styles.page}>
      <h1>My purchases</h1>
      {!purchases ? (
        <p>Loading…</p>
      ) : purchases.length === 0 ? (
        <EmptyState title="No purchases yet" />
      ) : (
        <div className={styles.list}>
          {purchases.map((p) => (
            <Link key={p.id} href={`/courses/${p.course.id}`}>
              <div className={styles.item}>
                <div>
                  <div className={styles.title}>{p.course.title}</div>
                  <div className={styles.meta}>
                    {new Date(p.createdAt).toLocaleDateString()} · {p.status}
                  </div>
                </div>
                <div className={styles.amount}>${p.amount}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
