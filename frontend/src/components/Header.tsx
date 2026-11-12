'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import type { SessionUser } from '../lib/types';
import { ThemeToggle } from './ui';
import { Logo } from './layout/Logo';
import { NavIcon } from './layout/NavIcon';
import { NotificationBell } from './layout/NotificationBell';
import { UserMenu } from './layout/UserMenu';
import { LanguageSwitcher } from './layout/LanguageSwitcher';
import { desktopNav, isActive } from './layout/nav';
import styles from './layout/Header.module.scss';

/**
 * Site header. Signed-in users get role navigation, notifications and the
 * avatar menu; guests get catalog + sign-in links (public pages).
 */
export function Header() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const user = session?.user as SessionUser | undefined;
  const t = useTranslations('nav');

  return (
    <header className={`${styles.header} no-print`}>
      <div className={styles.inner}>
        <Logo />
        {user ? (
          <>
            <nav aria-label={t('mainLabel')} className={styles.nav}>
              {desktopNav(user.role).map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={isActive(pathname, l.href) ? 'page' : undefined}
                  className={`${styles.link} ${isActive(pathname, l.href) ? styles.active : ''}`}
                >
                  <NavIcon name={l.icon} size={16} />
                  {t(`items.${l.label}`)}
                </Link>
              ))}
            </nav>
            <div className={styles.right}>
              <LanguageSwitcher />
              <ThemeToggle />
              <NotificationBell />
              <UserMenu user={user} />
            </div>
          </>
        ) : (
          <div className={styles.right}>
            <Link href="/catalog" className={`${styles.link} ${styles.hideSm}`}>
              {t('items.catalog')}
            </Link>
            <LanguageSwitcher />
            <ThemeToggle />
            {status !== 'loading' && (
              <>
                <Link href="/login" className={`${styles.link} ${styles.hideSm}`}>
                  {t('guest.login')}
                </Link>
                <Link href="/register" className={styles.cta}>
                  {t('guest.register')}
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
