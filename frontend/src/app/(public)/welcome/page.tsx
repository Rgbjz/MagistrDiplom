import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BarChart3,
  BookOpen,
  Check,
  ClipboardCheck,
  FileUp,
  GraduationCap,
  Languages,
  ListChecks,
  PlayCircle,
  Search,
  UserPlus,
  Users,
  Video,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { CatalogCourse, PublicCourse } from '../../../lib/types';
import { fileUrl } from '../../../lib/format';
import { categoryKey } from '../../../i18n/categories';
import { CatalogCard } from '../../../components/catalog/CatalogCard';
import { fetchCatalog, fetchPublicCourse } from '../../../components/catalog/publicApi';
import { CourseCover } from '../../../components/ui';
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
  { icon: PlayCircle, key: 'video' },
  { icon: ListChecks, key: 'tests' },
  { icon: FileUp, key: 'labs' },
  { icon: Video, key: 'calls' },
  { icon: ClipboardCheck, key: 'grades' },
  { icon: Languages, key: 'languages' },
] as const;

const FAQ = ['free', 'attempts', 'teacher', 'mobile'] as const;

interface Showcase {
  courses: CatalogCourse[];
  popular: CatalogCourse[];
  categories: string[];
  featured: PublicCourse | null;
  stats: { courses: number; lessons: number; enrollments: number; teachers: number };
}

/** Real numbers and courses from the public catalog; empty on API errors. */
async function loadShowcase(): Promise<Showcase> {
  const empty: Showcase = {
    courses: [],
    popular: [],
    categories: [],
    featured: null,
    stats: { courses: 0, lessons: 0, enrollments: 0, teachers: 0 },
  };
  try {
    const all = await fetchCatalog({ sort: 'popular', pageSize: 48 });
    const courses = all.items;
    // The hero shows the richest course that has a cover and a programme.
    const pick = [...courses]
      .filter((c) => c.imageUrl)
      .sort((a, b) => b.lessonsCount - a.lessonsCount || b.studentsCount - a.studentsCount)[0];
    const featured = pick ? await fetchPublicCourse(pick.id).catch(() => null) : null;
    return {
      courses,
      popular: courses.filter((c) => c.id !== pick?.id).slice(0, 4),
      categories: all.categories,
      featured,
      stats: {
        courses: all.total,
        lessons: courses.reduce((n, c) => n + c.lessonsCount, 0),
        enrollments: courses.reduce((n, c) => n + c.studentsCount, 0),
        teachers: new Set(courses.map((c) => c.teacher.name)).size,
      },
    };
  } catch {
    return empty;
  }
}

export default async function WelcomePage() {
  const { popular, categories, featured, stats } = await loadShowcase();
  const t = await getTranslations('public.welcome');
  const tc = await getTranslations('teacher.courseForm');
  const common = await getTranslations('common');
  const categoryLabel = (value: string) => {
    const key = categoryKey(value);
    return key ? tc(`categories.${key}` as never) : value;
  };
  const featuredLessons = featured?.sections.flatMap((s) => s.lessons).slice(0, 4) ?? [];
  const featuredCount = featured?.sections.reduce((n, s) => n + s.lessons.length, 0) ?? 0;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>{t('eyebrow')}</span>
          <h1 className={styles.heroTitle}>{t('title')}</h1>
          <p className={styles.lead}>{t('lead')}</p>
          <form action="/catalog" method="get" role="search" className={styles.heroSearch}>
            <Search size={20} aria-hidden="true" />
            <label htmlFor="welcome-search" className="sr-only">
              {t('searchLabel')}
            </label>
            <input
              id="welcome-search"
              type="search"
              name="search"
              placeholder={t('searchPlaceholder')}
              autoComplete="off"
            />
            <button type="submit">{t('searchButton')}</button>
          </form>
          <div className={styles.ctaRow}>
            <Link href="/register" className={styles.primaryCta}>
              {t('startLearning')}
            </Link>
            <Link href="/catalog" className={styles.secondaryCta}>
              {t('browseCatalog')}
            </Link>
          </div>
        </div>

        {featured && (
          <Link href={`/c/${featured.id}`} className={styles.showcase} aria-label={t('featuredAria', { title: featured.title })}>
            <CourseCover id={featured.id} imageUrl={fileUrl(featured.imageUrl)} title={featured.title} height={170}>
              <span className={styles.showcaseBadge}>{t('featured')}</span>
            </CourseCover>
            <span className={styles.showcaseBody}>
              <span className={styles.showcaseTitle}>{featured.title}</span>
              <span className={styles.showcaseMeta}>
                {featured.teacher.name} · {t('lessonsCount', { count: featuredCount })}
                {featured.level ? ` · ${common(`level.${featured.level}`)}` : ''}
              </span>
              <span className={styles.showcaseList}>
                {featuredLessons.map((l, i) => (
                  <span key={`${l.title}-${i}`} className={styles.showcaseLesson}>
                    {l.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote thumbnail, decorative
                      <img src={l.previewUrl} alt="" className={styles.showcaseThumb} loading="lazy" />
                    ) : (
                      <span className={styles.showcaseNum}>{i + 1}</span>
                    )}
                    <span className={styles.showcaseLessonTitle}>{l.title}</span>
                  </span>
                ))}
              </span>
              <span className={styles.showcaseCta}>{t('featuredCta')}</span>
            </span>
          </Link>
        )}
      </section>

      {stats.courses > 0 && (
        <section aria-label={t('statsLabel')} className={styles.stats}>
          {(
            [
              ['courses', stats.courses],
              ['lessons', stats.lessons],
              ['enrollments', stats.enrollments],
              ['teachers', stats.teachers],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className={styles.stat}>
              <span className={styles.statValue}>{value}</span>
              <span className={styles.statLabel}>{t(`stats.${key}`, { count: value })}</span>
            </div>
          ))}
        </section>
      )}

      {categories.length > 0 && (
        <section className={styles.section} aria-labelledby="welcome-categories">
          <h2 id="welcome-categories" className={styles.h2}>
            {t('categoriesTitle')}
          </h2>
          <ul className={styles.categories}>
            {categories.map((c) => (
              <li key={c}>
                <Link href={`/catalog?category=${encodeURIComponent(c)}`} className={styles.category}>
                  <BookOpen size={16} aria-hidden="true" />
                  {categoryLabel(c)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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
          <Users size={24} aria-hidden="true" className={styles.audienceIcon} />
          <h2 className={styles.h3}>{t('students.title')}</h2>
          <ul className={styles.checks}>
            {(['item1', 'item2', 'item3', 'item4'] as const).map((k) => (
              <li key={k}>
                <Check size={18} aria-hidden="true" />
                {t(`students.${k}`)}
              </li>
            ))}
          </ul>
          <Link href="/register?role=STUDENT" className={styles.secondaryCta}>
            {t('students.cta')}
          </Link>
        </div>
        <div className={`${styles.audience} ${styles.audienceDark}`}>
          <BarChart3 size={24} aria-hidden="true" className={styles.audienceIcon} />
          <h2 className={styles.h3}>{t('teachers.title')}</h2>
          <ul className={styles.checks}>
            {(['item1', 'item2', 'item3', 'item4'] as const).map((k) => (
              <li key={k}>
                <Check size={18} aria-hidden="true" />
                {t(`teachers.${k}`)}
              </li>
            ))}
          </ul>
          <Link href="/register?role=TEACHER" className={styles.primaryCta}>
            {t('teachers.cta')}
          </Link>
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
