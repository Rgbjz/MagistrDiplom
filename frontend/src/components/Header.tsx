'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import styles from './Header.module.scss';

export function Header() {
  const { data: session } = useSession();
  const user = session?.user;
  if (!user) return <header className={styles.header} />;

  const email = user.email ?? '';
  const initial = (email || '?').charAt(0).toUpperCase();

  return (
    <header className={styles.header}>
      <nav className={styles.nav}>
        <Link href="/">Courses</Link>
        {user.role === 'TEACHER' && (
          <Link href="/teacher/courses/new">Create course</Link>
        )}
        <Link href="/profile">Profile</Link>
      </nav>
      <div className={styles.user}>
        <span className={styles.avatar}>{initial}</span>
        <span className={styles.name}>{email}</span>
        <button className={styles.logoutBtn} onClick={() => signOut({ callbackUrl: '/login' })}>
          Logout
        </button>
      </div>
    </header>
  );
}
