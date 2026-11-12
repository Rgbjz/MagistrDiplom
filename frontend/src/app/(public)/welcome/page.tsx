import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BookOpen,
  Check,
  Clock,
  GraduationCap,
  LayoutDashboard,
  MessageCircle,
  Moon,
  Search,
  Smartphone,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { CatalogCourse } from '../../../lib/types';
import { CatalogCard } from '../../../components/catalog/CatalogCard';
import { fetchCatalog } from '../../../components/catalog/publicApi';
import styles from './welcome.module.scss';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('public.welcome');
  return { title: { absolute: t('metaTitle') } };
}

const STEPS = [
  { icon: Search, key: 'choose' },
  { icon: UserPlus, key: 'enroll' },
  { icon: GraduationCap, key: 'learn' },
] as const;

const FEATURES = [
  { icon: Clock, key: 'timer' },
  { icon: MessageCircle, key: 'chat' },
  { icon: TrendingUp, key: 'progress' },
  { icon: Moon, key: 'dark' },
  { icon: Smartphone, key: 'mobile' },
] as const;

const FAQ = ['free', 'attempts', 'teacher', 'mobile'] as const;

async function loadPopular(): Promise<CatalogCourse[]> {
  try {
    const res = await fetchCatalog({ sort: 'popular', pageSize: 4 });
    return res.items.slice(0, 4);
  } catch {
    return [];
  }
}

export default async function WelcomePage() {
  const popular = await loadPopular();
  const t = await getTranslations('public.welcome');

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>{t('eyebrow')}</span>
          <h1 className={styles.heroTitle}>{t('title')}</h1>
          <p className={styles.lead}>{t('lead')}</p>
          <div className={styles.ctaRow}>
            <Link href="/register" className={styles.primaryCta}>
              {t('startLearning')}
            </Link>
            <Link href="/catalog" className={styles.secondaryCta}>
              {t('browseCatalog')}
            </Link>
          </div>
        </div>

        <div className={styles.preview} aria-hidden="true">
          <div className={styles.previewHead}>
            <LayoutDashboard size={18} />
            <span>{t('previewContinue')}</span>
          </div>
          <div className={styles.previewRow}>
            <span className={styles.previewTile} data-tone="1" />
            <span className={styles.previewLines}>
              <span className={styles.lineWide} />
              <span className={styles.track}>
                <span style={{ width: '64%' }} />
              </span>
            </span>
          </div>
          <div className={styles.previewRow}>
            <span className={styles.previewTile} data-tone="3" />
            <span className={styles.previewLines}>
              <span className={styles.lineWide} />
              <span className={styles.track}>
                <span style={{ width: '38%' }} />
              </span>
            </span>
          </div>
          <div className={styles.previewTest}>
            <Clock size={16} />
            {t('previewTest')}
          </div>
        </div>
      </section>

      {popular.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.h2}>{t('popularTitle')}</h2>
            <Link href="/catalog" className={styles.link}>
              {t('allCatalog')}
            </Link>
          </div>
          <div className={styles.grid}>
            {popular.map((c) => (
              <CatalogCard key={c.id} course={c} />
            ))}
          </div>
        </section>
      )}

      <section id="how" className={styles.section}>
        <h2 className={styles.h2}>{t('howTitle')}</h2>
        <ol className={styles.steps}>
          {STEPS.map((s, i) => (
            <li key={s.key} className={styles.step}>
              <span className={styles.stepNum}>{i + 1}</span>
              <s.icon size={22} aria-hidden="true" className={styles.stepIcon} />
              <span className={styles.stepTitle}>{t(`steps.${s.key}.title`)}</span>
              <span className={styles.stepText}>{t(`steps.${s.key}.text`)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${styles.section} ${styles.audiences}`}>
        <div className={styles.audience}>
          <BookOpen size={24} aria-hidden="true" className={styles.audienceIcon} />
          <h2 className={styles.h3}>{t('students.title')}</h2>
          <ul className={styles.checks}>
            <li><Check size={18} aria-hidden="true" />{t('students.item1')}</li>
            <li><Check size={18} aria-hidden="true" />{t('students.item2')}</li>
            <li><Check size={18} aria-hidden="true" />{t('students.item3')}</li>
          </ul>
          <Link href="/register?role=STUDENT" className={styles.secondaryCta}>
            {t('students.cta')}
          </Link>
        </div>
        <div className={`${styles.audience} ${styles.audienceDark}`}>
          <GraduationCap size={24} aria-hidden="true" className={styles.audienceIcon} />
          <h2 className={styles.h3}>{t('teachers.title')}</h2>
          <ul className={styles.checks}>
            <li><Check size={18} aria-hidden="true" />{t('teachers.item1')}</li>
            <li><Check size={18} aria-hidden="true" />{t('teachers.item2')}</li>
            <li><Check size={18} aria-hidden="true" />{t('teachers.item3')}</li>
          </ul>
          <Link href="/register?role=TEACHER" className={styles.primaryCta}>
            {t('teachers.cta')}
          </Link>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>{t('featuresTitle')}</h2>
        <div className={styles.features}>
          {FEATURES.map((f) => (
            <div key={f.key} className={styles.feature}>
              <span className={styles.featureIcon}>
                <f.icon size={22} aria-hidden="true" />
              </span>
              <span className={styles.featureTitle}>{t(`features.${f.key}.title`)}</span>
              <span className={styles.featureText}>{t(`features.${f.key}.text`)}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className={styles.section}>
        <h2 className={styles.h2}>{t('faqTitle')}</h2>
        <div className={styles.faq}>
          {FAQ.map((key, i) => (
            <details key={key} open={i === 0} className={styles.faqItem}>
              <summary>{t(`faq.${key}.q`)}</summary>
              <p>{t(`faq.${key}.a`)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <h2 className={styles.finalTitle}>{t('finalTitle')}</h2>
        <p>{t('finalText')}</p>
        <div className={styles.ctaRow}>
          <Link href="/register" className={styles.primaryCta}>
            {t('createAccount')}
          </Link>
          <Link href="/login" className={styles.ghostCta}>
            {t('login')}
          </Link>
        </div>
      </section>
    </div>
  );
}
