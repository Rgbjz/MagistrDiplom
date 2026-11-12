'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '../components/ui';
import { LinkButton } from '../components/states/LinkButton';
import styles from '../components/states/States.module.scss';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('states.error');
  const c = useTranslations('common.actions');
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className={styles.page}>
      <div className={styles.state} role="alert">
        <span className={`${styles.icon} ${styles.danger}`}>
          <AlertTriangle size={28} aria-hidden="true" />
        </span>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.text}>{t('text')}</p>
        <div className={styles.actions}>
          <Button onClick={reset}>{c('retry')}</Button>
          <LinkButton href="/" variant="outline">
            {c('toHome')}
          </LinkButton>
        </div>
      </div>
    </main>
  );
}
