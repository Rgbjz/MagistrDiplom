'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../lib/api/client';
import { useApiErrorMessage } from '../../i18n/format';
import type { CalendarItem, CourseEventKind } from '../../lib/types';
import { Button, Field, Input, Modal, Select, Textarea, useToast } from '../ui';
import { toLocalInput } from './dates';
import styles from './calendar.module.scss';

const KINDS: CourseEventKind[] = ['LECTURE', 'ONLINE_LESSON', 'DEADLINE', 'OTHER'];

/** Filtered course if allowed, else the most recently updated published one. */
function defaultCourseId(
  courses: { id: number; published?: boolean; updatedAt?: string | null }[],
  preferred?: string,
): string {
  if (preferred && courses.some((c) => String(c.id) === preferred)) return preferred;
  const byRecent = [...courses].sort((a, b) =>
    (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
  );
  const pick = byRecent.find((c) => c.published !== false) ?? byRecent[0];
  return pick ? String(pick.id) : '';
}

/** Create or edit a course event (course team with content rights). */
export function EventFormModal({
  open,
  onClose,
  courses,
  preferredCourseId,
  event,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  courses: { id: number; title: string; published?: boolean; updatedAt?: string | null }[];
  /** Course the calendar is filtered by — preselected when the user may add to it. */
  preferredCourseId?: string;
  /** Existing event to edit; null → create. */
  event: CalendarItem | null;
  /** Day key to prefill the start date when creating. */
  defaultDate?: string;
}) {
  const t = useTranslations('calendar');
  const tc = useTranslations('common.actions');
  const errorText = useApiErrorMessage();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [courseId, setCourseId] = useState('');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<CourseEventKind>('LECTURE');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ title?: string; startsAt?: string; endsAt?: string }>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (event) {
      setCourseId(String(event.courseId));
      setTitle(event.title);
      setKind(event.kind === 'ASSIGNMENT' ? 'OTHER' : event.kind);
      setStartsAt(toLocalInput(event.startsAt));
      setEndsAt(toLocalInput(event.endsAt));
      setDescription(event.description ?? '');
    } else {
      setCourseId(defaultCourseId(courses, preferredCourseId));
      setTitle('');
      setKind('LECTURE');
      setStartsAt(defaultDate ? `${defaultDate}T10:00` : '');
      setEndsAt('');
      setDescription('');
    }
  }, [open, event, courses, defaultDate, preferredCourseId]);

  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({
        title: title.trim(),
        kind,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        description: description.trim() || (event ? null : undefined),
      });
      const init = { headers: { 'Content-Type': 'application/json' }, body };
      return event
        ? clientApi(`/courses/${event.courseId}/events/${event.eventId}`, { ...init, method: 'PATCH' })
        : clientApi(`/courses/${courseId}/events`, { ...init, method: 'POST' });
    },
    onSuccess: async () => {
      toast(event ? t('toast.updated') : t('toast.created'));
      await queryClient.invalidateQueries({ queryKey: ['calendar'] });
      onClose();
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  function submit() {
    const next: typeof errors = {};
    if (!title.trim()) next.title = t('form.errorTitle');
    if (!startsAt) next.startsAt = t('form.errorStart');
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) next.endsAt = t('form.errorEnd');
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event ? t('form.editTitle') : t('form.createTitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            {event ? t('form.save') : t('form.create')}
          </Button>
        </>
      }
    >
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!event && (
          <Field label={t('form.course')}>
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.published === false ? t('form.draftCourse', { title: c.title }) : c.title}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t('form.title')} error={errors.title}>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('form.titlePlaceholder')}
            maxLength={200}
            aria-invalid={!!errors.title}
          />
        </Field>
        <Field label={t('form.kind')}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as CourseEventKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kind.${k}`)}
              </option>
            ))}
          </Select>
        </Field>
        <div className={styles.formRow}>
          <Field label={t('form.startsAt')} error={errors.startsAt}>
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              aria-invalid={!!errors.startsAt}
            />
          </Field>
          <Field label={t('form.endsAt')} error={errors.endsAt}>
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              aria-invalid={!!errors.endsAt}
            />
          </Field>
        </div>
        <Field label={t('form.description')}>
          <Textarea
            rows={3}
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
