'use client';

import type { ActiveItem, CourseDetail } from '../../lib/types';
import { LessonEditor } from './LessonEditor';
import { TestEditor } from './TestEditor';

export function BuilderEditorPanel({
  active,
  course,
  onTestDeleted,
}: {
  active: ActiveItem;
  course: CourseDetail;
  onTestDeleted: () => void;
}) {
  if (!active) {
    return <p style={{ color: '#6b7280' }}>Select an item on the left 👈</p>;
  }
  if (active.type === 'SECTION') {
    return <p style={{ color: '#6b7280' }}>📚 A section groups lessons.</p>;
  }
  if (active.type === 'LESSON') {
    const lesson = course.sections
      .flatMap((s) => s.lessons)
      .find((l) => l.id === active.id);
    if (!lesson) return <p>Lesson not found.</p>;
    return <LessonEditor lesson={lesson} courseId={course.id} />;
  }
  return (
    <TestEditor
      testId={active.id}
      courseId={course.id}
      onDeleted={onTestDeleted}
    />
  );
}
