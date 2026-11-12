'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck,
  FileText,
  FileUp,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { clientApi } from '../../lib/api/client';
import { useTranslations } from 'next-intl';
import { useApiErrorMessage, useTestLabels } from '../../i18n/format';
import type { ActiveItem, CourseDetail } from '../../lib/types';
import { Button, ConfirmDialog, useToast } from '../ui';
import styles from './BuilderStructurePanel.module.scss';
import { canCourse } from '../../lib/courseRole';

type Kind = 'SECTION' | 'LESSON' | 'TEST' | 'ASSIGNMENT';
type EditTarget = { type: Kind; id: number } | null;
type DeleteTarget =
  | { type: 'SECTION' | 'LESSON'; id: number; title: string; lessons?: number }
  | { type: 'COURSE' }
  | null;

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
  const toast = useToast();
  const t = useTranslations('builder.structure');
  const errorText = useApiErrorMessage();
  const testLabels = useTestLabels();
  const queryClient = useQueryClient();
  const courseId = course.id;
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['course', courseId] });
  const onError = (e: unknown) => toast(errorText(e), 'error');

  const [editing, setEditing] = useState<EditTarget>(null);
  const [value, setValue] = useState('');
  const [toDelete, setToDelete] = useState<DeleteTarget>(null);

  const json = (body: unknown) => ({
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const addSection = useMutation({
    mutationFn: () =>
      clientApi(`/sections/${courseId}`, {
        method: 'POST',
        ...json({ title: t('defaultSection', { number: course.sections.length + 1 }) }),
      }),
    onSuccess: invalidate,
    onError,
  });
  const addLesson = useMutation({
    mutationFn: (sectionId: number) =>
      clientApi<{ id: number }>(`/lessons/${sectionId}`, {
        method: 'POST',
        ...json({ title: t('defaultLesson') }),
      }),
    onSuccess: (lesson) => {
      invalidate();
      if (lesson?.id) onSelect({ type: 'LESSON', id: lesson.id });
    },
    onError,
  });
  const addTest = useMutation({
    mutationFn: (lessonId: number) =>
      clientApi<{ id: number }>(`/tests/${lessonId}`, {
        method: 'POST',
        ...json({ title: t('defaultTest') }),
      }),
    onSuccess: (test) => {
      invalidate();
      if (test?.id) onSelect({ type: 'TEST', id: test.id });
    },
    onError,
  });
  const addAssignment = useMutation({
    mutationFn: (lessonId: number) =>
      clientApi<{ id: number }>(`/lessons/${lessonId}/assignment`, {
        method: 'POST',
        ...json({ title: t('defaultAssignment') }),
      }),
    onSuccess: (assignment) => {
      invalidate();
      if (assignment?.id) onSelect({ type: 'ASSIGNMENT', id: assignment.id });
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (target: NonNullable<DeleteTarget>) =>
      target.type === 'COURSE'
        ? clientApi(`/courses/${courseId}`, { method: 'DELETE' })
        : clientApi(
            target.type === 'SECTION' ? `/sections/${target.id}` : `/lessons/${target.id}`,
            { method: 'DELETE' },
          ),
    onSuccess: (_d, target) => {
      setToDelete(null);
      if (target.type === 'COURSE') {
        toast(t('courseDeleted'));
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        router.push('/');
        return;
      }
      toast(target.type === 'SECTION' ? t('sectionDeleted') : t('lessonDeleted'));
      onSelect(null);
      invalidate();
    },
    onError,
  });
  const rename = useMutation({
    mutationFn: ({ type, id, title }: { type: Kind; id: number; title: string }) => {
      const path =
        type === 'SECTION' ? `/sections/${id}` : type === 'LESSON' ? `/lessons/${id}` : `/tests/${id}`;
      return clientApi(path, { method: 'PATCH', ...json({ title }) });
    },
    onSuccess: invalidate,
    onError,
  });

  function startEdit(type: Kind, id: number, title: string) {
    setEditing({ type, id });
    setValue(title);
  }
  function commitEdit() {
    if (editing && value.trim()) {
      rename.mutate({ type: editing.type, id: editing.id, title: value.trim() });
    }
    setEditing(null);
  }
  const isActive = (type: string, id: number) => active?.type === type && active.id === id;
  const isEditing = (type: Kind, id: number) => editing?.type === type && editing.id === id;

  function renameInput(label: string) {
    return (
      <input
        className={styles.inlineInput}
        aria-label={label}
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

  const deleteText =
    toDelete?.type === 'COURSE'
      ? t('deleteCourseText', { title: course.title })
      : toDelete?.type === 'SECTION'
        ? t('deleteSectionText', { title: toDelete.title, count: toDelete.lessons ?? 0 })
        : toDelete
          ? t('deleteLessonText', { title: toDelete.title })
          : '';

  return (
    <aside className={styles.panel} aria-label={t('aria')}>
      {course.sections.length === 0 && (
        <p className={styles.empty}>{t('empty')}</p>
      )}

      {course.sections.map((section, si) => (
        <section key={section.id} className={styles.section}>
          <div className={`${styles.sectionHead} ${isActive('SECTION', section.id) ? styles.activeHead : ''}`}>
            {isEditing('SECTION', section.id) ? (
              renameInput(t('sectionName'))
            ) : (
              <button
                type="button"
                className={styles.sectionTitle}
                onClick={() => onSelect({ type: 'SECTION', id: section.id })}
                onDoubleClick={() => startEdit('SECTION', section.id, section.title)}
              >
                {si + 1}. {section.title}
              </button>
            )}
            <button
              type="button"
              className={styles.iconBtn}
              aria-label={t('renameSection', { title: section.title })}
              onClick={() => startEdit('SECTION', section.id, section.title)}
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label={t('deleteSection', { title: section.title })}
              onClick={() =>
                setToDelete({
                  type: 'SECTION',
                  id: section.id,
                  title: section.title,
                  lessons: section.lessons.length,
                })
              }
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>

          <ol className={styles.items}>
            {section.lessons.map((lesson) => (
              <li key={lesson.id}>
                <div className={`${styles.item} ${isActive('LESSON', lesson.id) ? styles.active : ''}`}>
                  <FileText size={16} aria-hidden="true" className={styles.itemIcon} />
                  {isEditing('LESSON', lesson.id) ? (
                    renameInput(t('lessonName'))
                  ) : (
                    <button
                      type="button"
                      className={styles.itemBtn}
                      onClick={() => onSelect({ type: 'LESSON', id: lesson.id })}
                      onDoubleClick={() => startEdit('LESSON', lesson.id, lesson.title)}
                    >
                      {lesson.title}
                    </button>
                  )}
                  {!lesson.test && (
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label={t('addTestTo', { title: lesson.title })}
                      title={t('addTest')}
                      onClick={() => addTest.mutate(lesson.id)}
                    >
                      <ClipboardCheck size={16} aria-hidden="true" />
                    </button>
                  )}
                  {!lesson.assignment && (
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label={t('addAssignmentTo', { title: lesson.title })}
                      title={t('addAssignment')}
                      onClick={() => addAssignment.mutate(lesson.id)}
                    >
                      <FileUp size={16} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label={t('deleteLesson', { title: lesson.title })}
                    onClick={() =>
                      setToDelete({ type: 'LESSON', id: lesson.id, title: lesson.title })
                    }
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
                {lesson.test && (
                  <div
                    className={`${styles.item} ${styles.testItem} ${isActive('TEST', lesson.test.id) ? styles.active : ''}`}
                  >
                    <span className={styles.testIcon} aria-hidden="true">
                      <ClipboardCheck size={14} />
                    </span>
                    <button
                      type="button"
                      className={styles.itemBtn}
                      onClick={() => onSelect({ type: 'TEST', id: lesson.test!.id })}
                    >
                      {testLabels.short(lesson.test.title)}
                    </button>
                  </div>
                )}
                {lesson.assignment && (
                  <div
                    className={`${styles.item} ${styles.testItem} ${isActive('ASSIGNMENT', lesson.assignment.id) ? styles.active : ''}`}
                  >
                    <span className={styles.testIcon} aria-hidden="true">
                      <FileUp size={14} />
                    </span>
                    <button
                      type="button"
                      className={styles.itemBtn}
                      onClick={() => onSelect({ type: 'ASSIGNMENT', id: lesson.assignment!.id })}
                    >
                      {t('assignmentItem', { title: lesson.assignment.title })}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>

          <div className={styles.addRow}>
            <button
              type="button"
              className={styles.addBtn}
              disabled={addLesson.isPending}
              onClick={() => addLesson.mutate(section.id)}
            >
              <Plus size={16} aria-hidden="true" />
              {t('addLesson')}
            </button>
          </div>
        </section>
      ))}

      <button
        type="button"
        className={styles.addSection}
        disabled={addSection.isPending}
        onClick={() => addSection.mutate()}
      >
        <Plus size={18} aria-hidden="true" />
        {t('addSection')}
      </button>

      {canCourse(course.myRole, 'owner') && (
        <div className={styles.danger}>
          <Button variant="ghost" size="sm" onClick={() => setToDelete({ type: 'COURSE' })}>
            <Trash2 size={16} aria-hidden="true" />
            {t('deleteCourse')}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title={
          toDelete?.type === 'COURSE'
            ? t('confirmCourse')
            : toDelete?.type === 'SECTION'
              ? t('confirmSection')
              : t('confirmLesson')
        }
        description={deleteText}
        confirmLabel={t('confirmDelete')}
        danger
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </aside>
  );
}
