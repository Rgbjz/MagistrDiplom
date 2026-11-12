'use client';

import { FileText, Layers, MousePointerClick } from 'lucide-react';
import type { ActiveItem, CourseDetail } from '../../lib/types';
import { useTranslations } from 'next-intl';
import { EmptyState } from '../ui';
import { LessonEditor } from './LessonEditor';
import { TestEditor } from './TestEditor';
import { AssignmentEditor } from './AssignmentEditor';
import styles from './LessonEditor.module.scss';

export function BuilderEditorPanel({
  active,
  course,
  onTestDeleted,
}: {
  active: ActiveItem;
  course: CourseDetail;
  onTestDeleted: () => void;
}) {
  const t = useTranslations('builder.editor');
  if (!active) {
    return (
      <div className={styles.card}>
        <EmptyState icon={<MousePointerClick size={40} />} title={t('pickTitle')}>
          <p className={styles.muted}>{t('pickHint')}</p>
        </EmptyState>
      </div>
    );
  }
  if (active.type === 'SECTION') {
    const section = course.sections.find((s) => s.id === active.id);
    const n = section?.lessons.length ?? 0;
    return (
      <div className={styles.card}>
        <EmptyState icon={<Layers size={40} />} title={section?.title ?? t('sectionFallback')}>
          <p className={styles.muted}>{t('sectionHint', { count: n })}</p>
        </EmptyState>
      </div>
    );
  }
  if (active.type === 'LESSON') {
    const lesson = course.sections.flatMap((s) => s.lessons).find((l) => l.id === active.id);
    if (!lesson) {
      return (
        <div className={styles.card}>
          <EmptyState icon={<FileText size={40} />} title={t('lessonNotFound')} />
        </div>
      );
    }
    return <LessonEditor lesson={lesson} courseId={course.id} />;
  }
  if (active.type === 'ASSIGNMENT') {
    return <AssignmentEditor assignmentId={active.id} courseId={course.id} onDeleted={onTestDeleted} />;
  }
  return <TestEditor testId={active.id} courseId={course.id} onDeleted={onTestDeleted} />;
}
