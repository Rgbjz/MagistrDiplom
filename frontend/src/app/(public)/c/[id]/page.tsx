import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check, ClipboardCheck, PlayCircle } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import type { PublicCourse } from '../../../../lib/types';
import { fileUrl, formatPrice, initials } from '../../../../lib/format';
import { Avatar, CourseCover } from '../../../../components/ui';
import { MessageButton } from '../../../../components/chat/MessageButton';
import { LandingCTA } from '../../../../components/store/LandingCTA';
import {
  fetchPublicCourse,
  PublicApiError,
} from '../../../../components/catalog/publicApi';
import styles from './landing.module.scss';
import { categoryKey } from '../../../../i18n/categories';

async function load(id: number): Promise<PublicCourse | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  try {
    return await fetchPublicCourse(id);
  } catch (err) {
    if (err instanceof PublicApiError && err.status === 404) return null;
    throw err;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const course = await load(Number(id)).catch(() => null);
  if (course) return { title: course.title };
  const t = await getTranslations('landing');
  return { title: t('metaFallback') };
}

export default async function CourseLandingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const course = await load(Number(id));
  if (!course) notFound();

  const t = await getTranslations('landing');
  const tc = await getTranslations('common');
  const tf = await getTranslations('teacher.courseForm');
  const locale = await getLocale();
  const free = course.price <= 0;
  const facts = [
    { label: t('facts.sections'), value: course.sectionsCount },
    { label: t('facts.lessons'), value: course.lessonsCount },
    { label: t('facts.tests'), value: course.testsCount },
    { label: t('facts.access'), value: t('facts.forever') },
  ];
  const includes = [
    t('includes.lessons', { count: course.lessonsCount }),
    course.testsCount > 0 ? t('includes.tests', { count: course.testsCount }) : null,
    t('includes.chat'),
    t('includes.certificate'),
    t('includes.mobile'),
  ].filter(Boolean) as string[];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <div className={styles.badges}>
            {course.category && (
              <span className={styles.badgePrimary}>
                {categoryKey(course.category)
                  ? tf(`categories.${categoryKey(course.category)}` as never)
                  : course.category}
              </span>
            )}
            {course.level && (
              <span className={styles.badge}>
                {t('levelBadge', { level: tc(`level.${course.level}`) })}
              </span>
            )}
            {free && <span className={styles.badgeSuccess}>{t('free')}</span>}
          </div>
          <h1 className={styles.title}>{course.title}</h1>
          {course.description && <p className={styles.lead}>{course.description}</p>}
          <div className={styles.teacher}>
            <Avatar
              src={fileUrl(course.teacher.avatarUrl)}
              name={initials(course.teacher.name)}
              size={44}
            />
            <span className={styles.teacherText}>
              <span className={styles.teacherName}>{course.teacher.name}</span>
              <span className={styles.muted}>{t('teacherRole')}</span>
            </span>
            <MessageButton userId={course.teacher.id} name={course.teacher.name} />
          </div>
          <dl className={styles.facts}>
            {facts.map((f) => (
              <div key={f.label} className={styles.fact}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <aside className={styles.priceCard} aria-label={t('priceAria')}>
          <CourseCover
            id={course.id}
            imageUrl={fileUrl(course.imageUrl)}
            title={course.title}
            height={180}
          />
          <div className={styles.priceBody}>
            <div className={styles.priceRow}>
              <span className={styles.price}>{formatPrice(course.price, locale)}</span>
              {!free && <span className={styles.muted}>{t('oneTime')}</span>}
            </div>
            <LandingCTA
              courseId={course.id}
              title={course.title}
              price={course.price}
              autoApprove={course.autoApprove}
            />
            <ul className={styles.includes}>
              {includes.map((text) => (
                <li key={text}>
                  <Check size={18} aria-hidden="true" />
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>{t('programTitle')}</h2>
        {course.sections.length === 0 ? (
          <p className={styles.muted}>{t('programEmpty')}</p>
        ) : (
          <div className={styles.program}>
            {course.sections.map((s, i) => {
              const tests = s.lessons.filter((l) => l.hasTest).length;
              return (
                <details key={i} open={i === 0} className={styles.programItem}>
                  <summary>
                    <span>
                      {i + 1}. {s.title}
                    </span>
                    <span className={styles.programMeta}>
                      {t('sectionLessons', { count: s.lessons.length })}
                      {tests > 0 && ` · ${t('sectionTests', { count: tests })}`}
                    </span>
                  </summary>
                  <ol className={styles.lessons}>
                    {s.lessons.map((l, j) => (
                      <li key={j}>
                        {l.previewUrl ? (
                          // Decorative: the lesson title follows.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className={styles.lessonThumb} src={l.previewUrl} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <PlayCircle size={16} aria-hidden="true" />
                        )}
                        <span>{l.title}</span>
                        {l.hasTest && (
                          <span className={styles.testTag}>
                            <ClipboardCheck size={14} aria-hidden="true" />
                            {t('testTag')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </details>
              );
            })}
          </div>
        )}
      </section>

      {course.teacher.bio && (
        <section className={styles.section}>
          <h2 className={styles.h2}>{t('aboutTeacher')}</h2>
          <div className={styles.about}>
            <Avatar
              src={fileUrl(course.teacher.avatarUrl)}
              name={initials(course.teacher.name)}
              size={64}
            />
            <div className={styles.aboutText}>
              <span className={styles.teacherName}>{course.teacher.name}</span>
              <p>{course.teacher.bio}</p>
            </div>
          </div>
        </section>
      )}

      <p className={styles.back}>
        <Link href="/catalog">{t('backToCatalog')}</Link>
      </p>
    </div>
  );
}
