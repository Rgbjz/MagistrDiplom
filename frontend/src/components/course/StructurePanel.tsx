'use client';

import { useRouter } from 'next/navigation';
import type {
  ActiveItem,
  CourseDetail,
  SessionUser,
} from '../../lib/types';
import { ProgressBar } from './ProgressBar';
import { ProgressIcon } from './ProgressIcon';
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
  const router = useRouter();
  const isStudent = user.role === 'STUDENT';
  const isOwner = user.id === course.teacherId || user.role === 'ADMIN';
  const progress = course.progress;
  const lessonDone = (id: number) => !!progress?.lessons.includes(id);
  const testDone = (id: number) => !!progress?.tests.includes(id);

  const isActive = (type: string, id: number) =>
    active?.type === type && active.id === id;

  return (
    <aside className={styles.left}>
      <div className={styles.courseHeader}>
        <h3 className={styles.courseTitle}>{course.title}</h3>
        {isOwner && (
          <button
            className={styles.manageBtn}
            onClick={() => router.push(`/courses/${course.id}/manage`)}
          >
            ⚙ Manage
          </button>
        )}
      </div>

      {isStudent && progress && <ProgressBar value={progress.percent} />}

      <ul className={styles.tree}>
        {course.sections.map((section) => (
          <li key={section.id} className={styles.section}>
            <div className={styles.row}>
              <span
                className={`${styles.item} ${
                  isActive('SECTION', section.id) ? styles.active : ''
                }`}
                onClick={() => onSelect({ type: 'SECTION', id: section.id })}
              >
                {section.title}
              </span>
            </div>
            <ul className={styles.sublist}>
              {section.lessons.map((lesson) => (
                <li key={lesson.id}>
                  <div className={styles.row}>
                    <span
                      className={`${styles.item} ${
                        isActive('LESSON', lesson.id) ? styles.active : ''
                      }`}
                      onClick={() =>
                        onSelect({ type: 'LESSON', id: lesson.id })
                      }
                    >
                      {isStudent && (
                        <ProgressIcon completed={lessonDone(lesson.id)} />
                      )}
                      {lesson.title}
                    </span>
                  </div>
                  {lesson.test && (
                    <div className={`${styles.row} ${styles.sublist}`}>
                      <span
                        className={`${styles.item} ${styles.test} ${
                          isActive('TEST', lesson.test.id) ? styles.active : ''
                        }`}
                        onClick={() =>
                          onSelect({ type: 'TEST', id: lesson.test!.id })
                        }
                      >
                        {isStudent && (
                          <ProgressIcon completed={testDone(lesson.test.id)} />
                        )}
                        📝 {lesson.test.title}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </aside>
  );
}
