import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookOpen, ShieldCheck } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatDate } from '../../../../lib/format';
import type { CertificateInfo } from '../../../../lib/types';
import { CertificateActions, CertificateQr, VerifyLink } from './CertificateClient';
import styles from './certificate.module.scss';
import { API_URL } from '../../../../lib/env';
import { INTL_LOCALE } from '../../../../i18n/config';

const API = API_URL;

async function getCertificate(code: string): Promise<CertificateInfo | null> {
  try {
    const res = await fetch(`${API}/certificates/${encodeURIComponent(code)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as CertificateInfo;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const t = await getTranslations('certificate');
  return { title: t('metaTitle', { code }) };
}

export default async function CertificatePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { code } = await params;
  const { new: isNew } = await searchParams;
  const cert = await getCertificate(code);
  if (!cert) notFound();
  const t = await getTranslations('certificate');
  const locale = await getLocale();

  return (
    <div className="container">
      <div className={`${styles.top} no-print`}>
        <div className={styles.topText}>
          <span className={styles.eyebrow}>
            <Link href="/my-courses?tab=completed">{t('myCourses')}</Link> / {cert.course.title}
          </span>
          <h1 className={styles.h1}>
            {isNew ? t('congrats') : t('title')}
          </h1>
        </div>
        <CertificateActions />
      </div>

      <div className={styles.layout}>
        <section aria-label={t('certLabel')} className={styles.cert}>
          <div className={styles.certInner}>
            <div className={styles.certHead}>
              <span className={styles.brand}>
                <span className={styles.brandMark}>
                  <BookOpen size={18} aria-hidden="true" />
                </span>
                LMS
              </span>
              <span className={styles.code}>{t('number', { code: cert.code })}</span>
            </div>

            <div className={styles.certBody}>
              <span className={styles.kicker}>{t('kicker')}</span>
              <span className={styles.small}>{t('confirms')}</span>
              <span className={styles.name}>{cert.student.name}</span>
              <span className={styles.small}>{t('completed')}</span>
              <span className={styles.course}>{t('courseQuoted', { title: cert.course.title })}</span>
            </div>

            <dl className={styles.facts}>
              <div>
                <dt>{t('lessons')}</dt>
                <dd>{cert.course.lessonsCount}</dd>
              </div>
              <div>
                <dt>{t('avgScore')}</dt>
                <dd>{cert.avgScore !== null ? `${cert.avgScore}%` : '—'}</dd>
              </div>
              <div>
                <dt>{t('issuedAt')}</dt>
                <dd>{new Date(cert.issuedAt).toLocaleDateString(INTL_LOCALE[locale])}</dd>
              </div>
            </dl>

            <div className={styles.certFoot}>
              <div className={styles.sign}>
                <span className={styles.signLine} aria-hidden="true" />
                <span className={styles.signName}>{cert.teacher.name}</span>
                <span className={styles.small}>{t('teacher')}</span>
              </div>
              <div className={styles.qrBox}>
                <CertificateQr />
                <span className={styles.small}>{t('qrCaption')}</span>
              </div>
            </div>
          </div>
        </section>

        <aside className={`${styles.side} no-print`}>
          <div className={styles.sideCard}>
            <h2 className={styles.sideTitle}>{t('howTo')}</h2>
            <ol className={styles.steps}>
              <li>{t('step1')}</li>
              <li>{t.rich('step2', { code: cert.code, b: (c) => <b>{c}</b> })}</li>
              <li>{t('step3')}</li>
            </ol>
            <VerifyLink />
          </div>
          <div className={styles.valid}>
            <ShieldCheck size={20} aria-hidden="true" />
            <span>{t('valid', { date: formatDate(cert.issuedAt, locale) })}</span>
          </div>
          <Link href="/catalog" className={styles.nextBtn}>
            {t('nextCourse')}
          </Link>
        </aside>
      </div>
    </div>
  );
}
