import type { CourseDetail, CourseLevel } from '../../../lib/types';

/**
 * Course categories: the stored value stays Ukrainian (catalog filters and
 * existing courses use it); only the label is translated via `labelKey`.
 */
export const CATEGORIES = [
  { value: 'Програмування', labelKey: 'programming' },
  { value: 'Дизайн', labelKey: 'design' },
  { value: 'Бази даних', labelKey: 'databases' },
  { value: 'Інструменти', labelKey: 'tools' },
  { value: 'Мови', labelKey: 'languages' },
  { value: 'Бізнес', labelKey: 'business' },
  { value: 'Інше', labelKey: 'other' },
] as const;

/** Translation key (under teacher.courseForm.validation) for a validation error. */
export type CourseFormError = 'titleMin' | 'priceMin';

export interface CourseFormState {
  title: string;
  description: string;
  category: string;
  level: CourseLevel | '';
  paid: boolean;
  price: string;
  autoApprove: boolean;
  image: File | null;
  /** Object URL of a newly picked image, or the existing course image URL. */
  imagePreview: string | null;
}

export const EMPTY_COURSE_FORM: CourseFormState = {
  title: '',
  description: '',
  category: '',
  level: '',
  paid: false,
  price: '',
  autoApprove: true,
  image: null,
  imagePreview: null,
};

export function formFromCourse(
  course: CourseDetail,
  imageUrl: string | null,
): CourseFormState {
  return {
    title: course.title,
    description: course.description ?? '',
    category: course.category ?? '',
    level: course.level ?? '',
    paid: course.price > 0,
    price: course.price > 0 ? String(course.price) : '',
    autoApprove: course.autoApprove ?? false,
    image: null,
    imagePreview: imageUrl,
  };
}

export function priceOf(form: CourseFormState): number {
  return form.paid ? Math.max(0, Math.round(Number(form.price) || 0)) : 0;
}

/** Validation error keys by field; empty object = valid. */
export function validateCourse(
  form: CourseFormState,
  step: 'basic' | 'pricing' | 'all' = 'all',
): Partial<Record<'title' | 'price', CourseFormError>> {
  const errors: Partial<Record<'title' | 'price', CourseFormError>> = {};
  if (step !== 'pricing' && form.title.trim().length < 3) {
    errors.title = 'titleMin';
  }
  if (step !== 'basic' && form.paid && priceOf(form) <= 0) {
    errors.price = 'priceMin';
  }
  return errors;
}

/** Multipart body for POST/PATCH /courses. */
export function toFormData(
  form: CourseFormState,
  extra: Record<string, string> = {},
): FormData {
  const fd = new FormData();
  fd.append('title', form.title.trim());
  fd.append('description', form.description.trim());
  fd.append('price', String(priceOf(form)));
  if (form.category) fd.append('category', form.category);
  if (form.level) fd.append('level', form.level);
  // Paid courses enroll on payment; approval mode only matters for free ones.
  fd.append('autoApprove', String(form.paid ? true : form.autoApprove));
  if (form.image) fd.append('image', form.image);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return fd;
}
