import type { ActiveItem, CourseDetail, Lesson } from '../../lib/types';

export type CourseItemType = 'LESSON' | 'TEST' | 'ASSIGNMENT';

export interface CourseItem {
  type: CourseItemType;
  id: number;
  title: string;
  lesson: Lesson;
  sectionIndex: number;
  lessonIndex: number;
  sectionLessons: number;
}

/** Course content in reading order: each lesson, then its test, then its assignment. */
export function flattenCourse(course: CourseDetail): CourseItem[] {
  const items: CourseItem[] = [];
  course.sections.forEach((section, sectionIndex) => {
    section.lessons.forEach((lesson, lessonIndex) => {
      const base = {
        lesson,
        sectionIndex,
        lessonIndex,
        sectionLessons: section.lessons.length,
      };
      items.push({ type: 'LESSON', id: lesson.id, title: lesson.title, ...base });
      if (lesson.test) {
        items.push({ type: 'TEST', id: lesson.test.id, title: lesson.test.title, ...base });
      }
      if (lesson.assignment) {
        items.push({
          type: 'ASSIGNMENT',
          id: lesson.assignment.id,
          title: lesson.assignment.title,
          ...base,
        });
      }
    });
  });
  return items;
}

export function isDone(course: CourseDetail, item: { type: string; id: number }): boolean {
  const p = course.progress;
  if (!p) return false;
  if (item.type === 'LESSON') return p.lessons.includes(item.id);
  if (item.type === 'ASSIGNMENT') return (p.assignments ?? []).includes(item.id);
  return p.tests.includes(item.id);
}

/**
 * First item the student hasn't finished; falls back to the first item.
 * Assignments wait for the teacher's grade, so they don't hold up the next lesson.
 */
export function firstPending(course: CourseDetail): ActiveItem {
  const items = flattenCourse(course);
  const next =
    items.find((i) => i.type !== 'ASSIGNMENT' && !isDone(course, i)) ??
    items.find((i) => !isDone(course, i)) ??
    items[0];
  return next ? { type: next.type, id: next.id } : null;
}

export function sameItem(a: ActiveItem, b: { type: string; id: number } | null): boolean {
  return !!a && !!b && a.type === b.type && a.id === b.id;
}
