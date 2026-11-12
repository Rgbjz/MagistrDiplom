'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { readConsent, saveConsent, type Consent } from '../../lib/analytics';
import { Button } from '../ui';
import styles from './ConsentBanner.module.scss';

export function ConsentBanner() {
  const t = useTranslations('public.consent');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(readConsent() === null);
  }, []);

  if (!open) return null;

  function choose(value: Consent) {
    saveConsent(value);
    setOpen(false);
  }

  return (
    <section
      className={`${styles.banner} no-print`}
      role="region"
      aria-label={t('aria')}
    >
      <p className={styles.text}>
        {t('text')} <Link href="/privacy">{t('more')}</Link>
      </p>
      <div className={styles.actions}>
        <Button variant="outline" size="sm" onClick={() => choose('denied')}>
          {t('decline')}
        </Button>
        <Button size="sm" onClick={() => choose('granted')}>
          {t('accept')}
        </Button>
      </div>
    </section>
  );
}
