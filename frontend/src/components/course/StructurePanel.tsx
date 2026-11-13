'use client';

import { useTranslations } from 'next-intl';
import { useTestLabels } from '../../i18n/format';
import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, ClipboardCheck, FileUp, Play } from 'lucide-react';
import type { ActiveItem, CourseDetail, SessionUser } from '../../lib/types';
import { isDone, sameItem, type CourseItemType } from './courseItems';
import { lessonPreview } from '../../lib/video';
import styles from './StructurePanel.module.scss';

export function StructurePanel({
  course,
  user,
  active,
  onSelect,
}: {
  course: CourseDetail;
  user: SessionUser;
  active: ActiveItem;
  onSelect: (item: ActiveItem) => void;
}) {
  const t = useTranslations('course.structure');
  const tests = useTestLabels();
  const isStudent = user.role === 'STUDENT';
  const activeSection = course.sections.find((s) =>
    s.lessons.some(
      (l) =>
        sameItem(active, { type: 'LESSON', id: l.id }) ||
        (l.test && sameItem(active, { type: 'TEST', id: l.test.id })) ||
        (l.assignment && sameItem(active, { type: 'ASSIGNMENT', id: l.assignment.id })),
    ),
  )?.id;
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(activeSection ? [activeSection] : course.sections.slice(0, 1).map((s) => s.id)),
  );

  // Keep the section of the current item expanded when navigating.
  useEffect(() => {
    if (activeSection) setOpen((prev) => (prev.has(activeSection) ? prev : new Set(prev).add(activeSection)));
  }, [activeSection]);

  const totalItems = course.progress?.total ?? 0;
  const doneItems = course.progress?.completed ?? 0;

  function toggle(id: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <nav aria-label={t('title')} className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.headTitle}>{t('title')}</span>
        {isStudent && course.progress && (
          <span className={styles.headCount}>
            {doneItems} / {totalItems}
          </span>
        )}
      </div>

      {course.sections.length === 0 && (
        <p className={styles.empty}>{t('empty')}</p>
      )}

      {course.sections.map((section, si) => {
        const expanded = open.has(section.id);
        const lessonsDone = section.lessons.filter((l) => isDone(course, { type: 'LESSON', id: l.id })).length;
        const complete = section.lessons.length > 0 && lessonsDone === section.lessons.length;
        return (
          <div key={section.id} className={styles.section}>
            <button
              type="button"
              className={styles.sectionBtn}
              aria-expanded={expanded}
              onClick={() => toggle(section.id)}
            >
              <span>
                {si + 1}. {section.title}
              </span>
              <span className={`${styles.sectionMeta} ${complete ? styles.sectionDone : ''}`}>
                {isStudent && `${lessonsDone}/${section.lessons.length}`}
                {expanded ? (
                  <ChevronUp size={18} aria-hidden="true" />
                ) : (
                  <ChevronDown size={18} aria-hidden="true" />
                )}
              </span>
            </button>
            {expanded && (
              <ol className={styles.list}>
                {section.lessons.map((lesson) => {
                  const items: { type: CourseItemType; id: number; title: string }[] = [
                    { type: 'LESSON', id: lesson.id, title: lesson.title },
                  ];
                  if (lesson.test) items.push({ type: 'TEST', id: lesson.test.id, title: lesson.test.title });
                  if (lesson.assignment) {
                    items.push({ type: 'ASSIGNMENT', id: lesson.assignment.id, title: lesson.assignment.title });
                  }
                  const preview = lessonPreview(lesson);
                  return items.map((item) => {
                    const current = sameItem(active, item);
                    const done = isStudent && isDone(course, item);
                    return (
                      <li key={`${item.type}-${item.id}`}>
                        <button
                          type="button"
                          aria-current={current ? 'page' : undefined}
                          className={`${styles.item} ${current ? styles.current : ''} ${done && !current ? styles.done : ''}`}
                          onClick={() => onSelect({ type: item.type, id: item.id })}
                        >
                          <StatusIcon type={item.type} done={done} current={current} />
                          <span className={styles.itemTitle}>
                            {item.type === 'TEST'
                              ? tests.short(item.title)
                              : item.type === 'ASSIGNMENT'
                                ? t('assignment', { title: item.title })
                                : item.title}
                          </span>
                          {item.type === 'LESSON' && preview && (
                            // Decorative: the title next to it already names the lesson.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className={styles.thumb} src={preview} alt="" loading="lazy" decoding="async" />
                          )}
                          {done && <span className="sr-only">{t('done')}</span>}
                        </button>
                      </li>
                    );
                  });
                })}
              </ol>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function StatusIcon({ type, done, current }: { type: CourseItemType; done: boolean; current: boolean }) {
  if (done) {
    return (
      <span className={`${styles.icon} ${styles.iconDone}`}>
        <Check size={14} strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  if (type === 'TEST') {
    return (
      <span className={`${styles.icon} ${styles.iconTest}`}>
        <ClipboardCheck size={13} aria-hidden="true" />
      </span>
    );
  }
  if (type === 'ASSIGNMENT') {
    return (
      <span className={`${styles.icon} ${styles.iconTest}`}>
        <FileUp size={13} aria-hidden="true" />
      </span>
    );
  }
  if (current) {
    return (
      <span className={`${styles.icon} ${styles.iconCurrent}`}>
        <Play size={10} fill="currentColor" aria-hidden="true" />
      </span>
    );
  }
  return <span className={`${styles.icon} ${styles.iconTodo}`} />;
}
