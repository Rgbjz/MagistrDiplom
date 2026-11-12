'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import type { SessionUser } from '../../lib/types';
import { NavIcon } from './NavIcon';
import { isActive, mobileNav } from './nav';
import styles from './Header.module.scss';

/** Bottom tab bar shown under 768px instead of the header navigation. */
export function MobileTabBar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const user = session?.user as SessionUser | undefined;
  const t = useTranslations('nav');
  if (!user) return null;

  return (
    <nav aria-label={t('mobileLabel')} className={`${styles.tabBar} no-print`}>
      {mobileNav(user.role).map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`${styles.tab} ${active ? styles.tabActive : ''}`}
          >
            <NavIcon name={item.icon} size={22} />
            {t(`items.${item.label}`)}
          </Link>
        );
      })}
    </nav>
  );
}
