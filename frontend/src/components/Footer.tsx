import Link from 'next/link';
import { useTranslations } from 'next-intl';
import styles from './Footer.module.scss';

export function Footer() {
  const t = useTranslations('nav.footer');
  return (
    <footer className={`${styles.footer} no-print`}>
      <div className={styles.inner}>
        <span>{t('copyright', { year: new Date().getFullYear() })}</span>
        <nav aria-label={t('label')} className={styles.links}>
          <Link href="/catalog">{t('catalog')}</Link>
          <Link href="/welcome#faq">{t('faq')}</Link>
          <Link href="/privacy">{t('privacy')}</Link>
        </nav>
      </div>
    </footer>
  );
}
