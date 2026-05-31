'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { clientApi } from '../../lib/api/client';
import type { ActiveItem, CourseDetail } from '../../lib/types';
import styles from './BuilderStructurePanel.module.scss';

type EditTarget = { type: 'SECTION' | 'LESSON' | 'TEST'; id: number } | null;

export function BuilderStructurePanel({
  course,
  active,
  onSelect,
}: {
  course: CourseDetail;
  active: ActiveItem;
  onSelect: (item: ActiveItem) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const courseId = course.id;
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['course', courseId] });

  const [editing, setEditing] = useState<EditTarget>(null);
  const [value, setValue] = useState('');

  const addSection = useMutation({
    mutationFn: () =>
      clientApi(`/sections/${courseId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New section' }),
      }),
    onSuccess: invalidate,
  });
  const addLesson = useMutation({
    mutationFn: (sectionId: number) =>
      clientApi(`/lessons/${sectionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New lesson' }),
      }),
    onSuccess: invalidate,
  });
  const addTest = useMutation({
    mutationFn: (lessonId: number) =>
      clientApi(`/tests/${lessonId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test' }),
      }),
    onSuccess: invalidate,
  });
  const delSection = useMutation({
    mutationFn: (id: number) =>
      clientApi(`/sections/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
  const delLesson = useMutation({
    mutationFn: (id: number) =>
      clientApi(`/lessons/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
  const rename = useMutation({
    mutationFn: ({
      type,
      id,
      title,
    }: {
      type: 'SECTION' | 'LESSON' | 'TEST';
      id: number;
      title: string;
    }) => {
      const path =
        type === 'SECTION'
          ? `/sections/${id}`
          : type === 'LESSON'
            ? `/lessons/${id}`
            : `/tests/${id}`;
      return clientApi(path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
    },
    onSuccess: invalidate,
  });
  const delCourse = useMutation({
    mutationFn: () => clientApi(`/courses/${courseId}`, { method: 'DELETE' }),
    onSuccess: () => router.push('/'),
  });
  const savePrice = useMutation({
    mutationFn: (price: number) =>
      clientApi(`/courses/${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price }),
      }),
    onSuccess: invalidate,
  });

  function startEdit(type: 'SECTION' | 'LESSON' | 'TEST', id: number, title: string) {
    setEditing({ type, id });
    setValue(title);
  }
  function commitEdit() {
    if (editing && value.trim()) {
      rename.mutate({ type: editing.type, id: editing.id, title: value.trim() });
    }
    setEditing(null);
  }

  const isActive = (type: string, id: number) =>
    active?.type === type && active.id === id;

  function renameInput() {
    return (
      <input
        className={styles.inlineInput}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitEdit();
          if (e.key === 'Escape') setEditing(null);
        }}
      />
    );
  }

  return (
    <aside className={styles.left}>
      <div className={styles.header}>
        <h3>{course.title}</h3>
        <button
          className={styles.manageBtn}
          onClick={() => router.push(`/courses/${courseId}/manage`)}
        >
          ⚙ Manage
        </button>
      </div>
      <div className={styles.priceRow}>
        <label>Price $</label>
        <input
          type="number"
          min={0}
          defaultValue={course.price}
          onBlur={(e) => savePrice.mutate(Number(e.target.value) || 0)}
        />
      </div>
      <button className={styles.addBtn} onClick={() => addSection.mutate()}>
        + Add section
      </button>

      <ul className={styles.tree}>
        {course.sections.map((section) => (
          <li key={section.id} className={styles.section}>
            <div className={styles.row}>
              {editing?.type === 'SECTION' && editing.id === section.id ? (
                renameInput()
              ) : (
                <span
                  className={`${styles.item} ${isActive('SECTION', section.id) ? styles.active : ''}`}
                  onClick={() => onSelect({ type: 'SECTION', id: section.id })}
                  onDoubleClick={() =>
                    startEdit('SECTION', section.id, section.title)
                  }
                >
                  {section.title}
                </span>
              )}
              <div className={styles.actions}>
                <button onClick={() => addLesson.mutate(section.id)}>＋L</button>
                <button onClick={() => delSection.mutate(section.id)}>🗑</button>
              </div>
            </div>
            <ul className={styles.sublist}>
              {section.lessons.map((lesson) => (
                <li key={lesson.id}>
                  <div className={styles.row}>
                    {editing?.type === 'LESSON' && editing.id === lesson.id ? (
                      renameInput()
                    ) : (
                      <span
                        className={`${styles.item} ${isActive('LESSON', lesson.id) ? styles.active : ''}`}
                        onClick={() => onSelect({ type: 'LESSON', id: lesson.id })}
                        onDoubleClick={() =>
                          startEdit('LESSON', lesson.id, lesson.title)
                        }
                      >
                        {lesson.title}
                      </span>
                    )}
                    <div className={styles.actions}>
                      {!lesson.test && (
                        <button onClick={() => addTest.mutate(lesson.id)}>
                          ＋T
                        </button>
                      )}
                      <button onClick={() => delLesson.mutate(lesson.id)}>
                        🗑
                      </button>
                    </div>
                  </div>
                  {lesson.test && (
                    <div className={`${styles.row} ${styles.sublist}`}>
                      <span
                        className={`${styles.item} ${styles.test} ${isActive('TEST', lesson.test.id) ? styles.active : ''}`}
                        onClick={() => onSelect({ type: 'TEST', id: lesson.test!.id })}
                      >
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

      <button className={styles.deleteCourse} onClick={() => delCourse.mutate()}>
        Delete course
      </button>
    </aside>
  );
}
