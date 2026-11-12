import Link from 'next/link';
import { BookOpen, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { CatalogCourse } from '../../lib/types';
import { fileUrl, formatPrice } from '../../lib/format';
import { CourseCover } from '../ui';
import styles from './CatalogCard.module.scss';
import { useCategoryLabel } from '../../i18n/categories';

/**
 * Public catalog card: the whole card links to the course landing.
 * Rendered both by the async server welcome page and the client catalog, so it
 * uses next-intl hooks that work in either (not the client-only i18n/format).
 */
export function CatalogCard({
  course,
  layout = 'grid',
}: {
  course: CatalogCourse;
  layout?: 'grid' | 'row';
}) {
  const t = useTranslations('common');
  const categoryLabel = useCategoryLabel();
  const locale = useLocale();
  const free = course.price <= 0;
  return (
    <Link
      href={`/c/${course.id}`}
      className={`${styles.card} ${layout === 'row' ? styles.row : ''}`}
    >
      <CourseCover
        id={course.id}
        imageUrl={fileUrl(course.imageUrl)}
        title={course.title}
        height={layout === 'row' ? 88 : 140}
      >
        <span className={`${styles.price} ${free ? styles.free : ''}`}>
          {formatPrice(course.price, locale)}
        </span>
      </CourseCover>
      <div className={styles.body}>
        {(course.category || course.level) && (
          <span className={styles.meta}>
            {[course.category ? categoryLabel(course.category) : null, course.level ? t(`level.${course.level}`) : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
        <h3 className={styles.title}>{course.title}</h3>
        <span className={styles.teacher}>{course.teacher.name}</span>
        <span className={styles.stats}>
          <span>
            <BookOpen size={14} aria-hidden="true" />
            {t('count.lessons', { count: course.lessonsCount })}
          </span>
          {course.studentsCount > 0 && (
            <span>
              <Users size={14} aria-hidden="true" />
              {t('count.students', { count: course.studentsCount })}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}
