'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { Award, CalendarDays, LogOut, ShoppingBag, User } from 'lucide-react';
import { clientApi } from '../../lib/api/client';
import { useTranslations } from 'next-intl';
import { displayName, fileUrl } from '../../lib/format';
import { useLabels } from '../../i18n/format';
import type { Me, SessionUser } from '../../lib/types';
import { Avatar } from '../ui';
import styles from './Header.module.scss';

export function UserMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = useTranslations('nav.userMenu');
  const labels = useLabels();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => clientApi<Me>('/users/me'),
  });
  const name = displayName(me?.profile, user.email);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.menuWrap} ref={ref}>
      <button
        type="button"
        className={styles.avatarBtn}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('label')}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar src={fileUrl(me?.profile?.avatarUrl)} name={name} size={36} />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.menuHead}>
            <span className={styles.menuName}>{name}</span>
            <span className={styles.menuRole}>
              {labels.role(user.role)} · {user.email}
            </span>
          </div>
          <Link href="/profile" role="menuitem" className={styles.menuItem} onClick={() => setOpen(false)}>
            <User size={16} aria-hidden="true" /> {t('profile')}
          </Link>
          <Link href="/calendar" role="menuitem" className={styles.menuItem} onClick={() => setOpen(false)}>
            <CalendarDays size={16} aria-hidden="true" /> {t('calendar')}
          </Link>
          {user.role === 'STUDENT' && (
            <>
              <Link href="/purchases" role="menuitem" className={styles.menuItem} onClick={() => setOpen(false)}>
                <ShoppingBag size={16} aria-hidden="true" /> {t('purchases')}
              </Link>
              <Link href="/my-courses?tab=completed" role="menuitem" className={styles.menuItem} onClick={() => setOpen(false)}>
                <Award size={16} aria-hidden="true" /> {t('certificates')}
              </Link>
            </>
          )}
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            <LogOut size={16} aria-hidden="true" /> {t('logout')}
          </button>
        </div>
      )}
    </div>
  );
}
