'use client';

import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { clientApi } from '../../lib/api/client';
import type { DashboardData, SessionUser } from '../../lib/types';
import { StatCards } from '../../components/dashboard/StatCards';
import { ContinueLearning } from '../../components/dashboard/ContinueLearning';
import { Catalog } from '../../components/dashboard/Catalog';
import { RecentChats } from '../../components/dashboard/RecentChats';
import { Button, Skeleton } from '../../components/ui';
import styles from './dashboard.module.scss';

export default function DashboardPage() {
  const { data: session } = useSession();
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => clientApi<DashboardData>('/dashboard'),
  });

  if (!session) return null;
  const user = session.user as SessionUser;
  const greetingName = data?.name || user.email;

  return (
    <div className={styles.page}>
      <h1 className={styles.greeting}>
        Hi, {greetingName} 👋
      </h1>

      {isLoading || !data ? (
        <Skeleton height={120} radius="var(--radius-lg)" />
      ) : data.role === 'STUDENT' ? (
        <>
          {data.stats && (
            <section className={styles.section}>
              <StatCards stats={data.stats} />
            </section>
          )}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Continue learning</h2>
            <ContinueLearning courses={data.continueLearning ?? []} />
          </section>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Catalog</h2>
            <Catalog user={user} />
          </section>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Recent chats</h2>
            <RecentChats conversations={data.recentConversations} />
          </section>
        </>
      ) : (
        <>
          <section className={styles.section}>
            <Link href="/teacher/courses/new">
              <Button variant="primary">+ Create course</Button>
            </Link>
          </section>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>My courses</h2>
            <div className={styles.grid}>
              {(data.teachingCourses ?? []).map((c) => (
                <Link key={c.id} href={`/teacher/courses/${c.id}/builder`}>
                  <div className={styles.continueCard} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
                    <div className={styles.continueTitle}>{c.title}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Catalog</h2>
            <Catalog user={user} />
          </section>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Recent chats</h2>
            <RecentChats conversations={data.recentConversations} />
          </section>
        </>
      )}
    </div>
  );
}
