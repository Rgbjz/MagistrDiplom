'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { clientApi } from '../../lib/api/client';
import type { CourseListItem, SessionUser } from '../../lib/types';
import { CourseCard } from '../CourseCard';
import { Skeleton, EmptyState } from '../ui';
import styles from '../../app/(app)/dashboard.module.scss';

export function Catalog({ user }: { user: SessionUser }) {
  const [search, setSearch] = useState('');
  const { data: courses, isLoading } = useQuery<CourseListItem[]>({
    queryKey: ['courses', search],
    queryFn: () =>
      clientApi<CourseListItem[]>(
        `/courses${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  return (
    <div>
      <div className={styles.searchBox}>
        <Search size={18} />
        <input
          placeholder="Search courses…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {isLoading ? (
        <div className={styles.grid}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={220} radius="var(--radius-lg)" />
          ))}
        </div>
      ) : (courses ?? []).length === 0 ? (
        <EmptyState title="No courses found" />
      ) : (
        <div className={styles.grid}>
          {(courses ?? []).map((c) => (
            <CourseCard key={c.id} course={c} user={user} />
          ))}
        </div>
      )}
    </div>
  );
}
