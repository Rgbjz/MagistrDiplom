import { useTranslations } from 'next-intl';
import { CATEGORIES } from '../components/teacher/course-form/courseForm';

/**
 * Course categories are stored as Ukrainian values (catalog filters match on
 * them); this maps a known value to its label in the current locale and leaves
 * custom categories as they are.
 */
export function categoryKey(value: string): string | null {
  return CATEGORIES.find((c) => c.value === value)?.labelKey ?? null;
}

export function useCategoryLabel() {
  const t = useTranslations('teacher.courseForm');
  return (value: string): string => {
    const key = categoryKey(value);
    return key ? t(`categories.${key}` as never) : value;
  };
}
