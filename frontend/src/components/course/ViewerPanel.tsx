'use client';

import type { ActiveItem, CourseDetail, SessionUser } from '../../lib/types';
import { LessonViewer } from './LessonViewer';
import { TestViewer } from './TestViewer';

export function ViewerPanel({
  active,
  course,
  user,
}: {
  active: ActiveItem;
  course: CourseDetail;
  user: SessionUser;
}) {
  if (!active) {
    return <p style={{ color: '#6b7280' }}>Select a lesson or test on the left 👈</p>;
  }
  if (active.type === 'SECTION') {
    return <p style={{ color: '#6b7280' }}>📚 A section groups lessons.</p>;
  }
  if (active.type === 'LESSON') {
    const lesson = course.sections
      .flatMap((s) => s.lessons)
      .find((l) => l.id === active.id);
    if (!lesson) return <p>Lesson not found.</p>;
    return <LessonViewer lesson={lesson} courseId={course.id} user={user} />;
  }
  return <TestViewer testId={active.id} courseId={course.id} user={user} />;
}
