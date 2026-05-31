'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';
import { BookOpen, Plus, MessageSquare, User, LogOut, Menu } from 'lucide-react';
import { Avatar, ThemeToggle } from './ui';
import styles from './Header.module.scss';

export function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const user = session?.user;
  if (!user) return <header className={styles.header} />;

  const email = user.email ?? '';
  const links = [
    { href: '/', label: 'Courses', icon: <BookOpen size={16} /> },
    ...(user.role === 'TEACHER'
      ? [
          {
            href: '/teacher/courses/new',
            label: 'Create',
            icon: <Plus size={16} />,
          },
        ]
      : []),
    { href: '/chat', label: 'Chat', icon: <MessageSquare size={16} /> },
    { href: '/profile', label: 'Profile', icon: <User size={16} /> },
  ];

  return (
    <header className={styles.header}>
      <button
        className={styles.burger}
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
      >
        <Menu size={20} />
      </button>

      <nav className={`${styles.nav} ${open ? styles.navOpen : ''}`}>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => setOpen(false)}
            className={`${styles.link} ${pathname === l.href ? styles.active : ''}`}
          >
            {l.icon}
            {l.label}
          </Link>
        ))}
      </nav>

      <div className={styles.right}>
        <ThemeToggle />
        <span className={styles.email}>{email}</span>
        <Avatar name={email} size={34} />
        <button
          className={styles.logout}
          onClick={() => signOut({ callbackUrl: '/login' })}
          aria-label="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
