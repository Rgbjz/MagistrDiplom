import type { Metadata } from 'next';
import { Fragment } from 'react';
import { getTranslations } from 'next-intl/server';
import styles from './privacy.module.scss';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('public.privacy');
  return { title: t('metaTitle') };
}

const SECTIONS = ['account', 'emails', 'analytics', 'cookies'] as const;

export default async function PrivacyPage() {
  const t = await getTranslations('public.privacy');
  return (
    <div className="container">
      <article className={styles.article}>
        <h1>{t('title')}</h1>
        <p>{t('intro')}</p>
        {SECTIONS.map((key) => (
          // Fragment keeps h2/p as direct children of the flex column (same spacing).
          <Fragment key={key}>
            <h2>{t(`${key}Title`)}</h2>
            <p>{t(`${key}Text`)}</p>
          </Fragment>
        ))}
      </article>
    </div>
  );
}
