'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Link2, Pencil, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { clientApi } from '../../lib/api/client';
import { INTL_LOCALE, type Locale } from '../../i18n/config';
import { useApiErrorMessage } from '../../i18n/format';
import type { CalendarItem, CalendarResponse } from '../../lib/types';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
  useToast,
} from '../ui';
import { QueryError } from '../states';
import {
  CALENDAR_TZ,
  gridRange,
  groupByDay,
  monthGrid,
  monthKey,
  monthOf,
  parseMonth,
  todayKey,
} from './dates';
import { EventFormModal } from './EventFormModal';
import { SubscribeModal } from './SubscribeModal';
import styles from './calendar.module.scss';

type View = 'month' | 'agenda';
const MAX_CHIPS = 3;
const KIND_TONE = {
  ASSIGNMENT: 'warning',
  LECTURE: 'primary',
  ONLINE_LESSON: 'success',
  DEADLINE: 'danger',
  OTHER: 'neutral',
} as const;

export function CalendarView() {
  const t = useTranslations('calendar');
  const locale = useLocale() as Locale;
  const intl = INTL_LOCALE[locale];
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const errorText = useApiErrorMessage();
  const queryClient = useQueryClient();

  const today = todayKey();
  const view: View = params.get('view') === 'agenda' ? 'agenda' : 'month';
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : null;
  const month =
    parseMonth(params.get('month')) ??
    parseMonth(monthOf(selected ?? today))!;
  const courseFilter = params.get('course') ?? '';

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarItem | null>(null);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [deleting, setDeleting] = useState<CalendarItem | null>(null);

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') sp.delete(k);
      else sp.set(k, v);
    }
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  const grid = useMemo(() => monthGrid(month.year, month.month), [month.year, month.month]);
  const range = useMemo(() => {
    if (view === 'month') return gridRange(grid);
    const from = new Date(`${today}T00:00:00Z`).getTime() - 86_400_000;
    return {
      from: new Date(from).toISOString(),
      to: new Date(from + 62 * 86_400_000).toISOString(),
    };
  }, [view, grid, today]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['calendar', range.from, range.to],
    queryFn: () =>
      clientApi<CalendarResponse>(
        `/calendar?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
      ),
  });

  const items = useMemo(
    () =>
      (data?.items ?? []).filter(
        (i) => !courseFilter || String(i.courseId) === courseFilter,
      ),
    [data, courseFilter],
  );
  const byDay = useMemo(() => groupByDay(items), [items]);

  const remove = useMutation({
    mutationFn: (item: CalendarItem) =>
      clientApi(`/courses/${item.courseId}/events/${item.eventId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setDeleting(null);
      toast(t('toast.deleted'));
      await queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(intl, { timeZone: CALENDAR_TZ, hour: '2-digit', minute: '2-digit' });
  const fmtDay = (key: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${key}T12:00:00Z`).toLocaleDateString(intl, { timeZone: 'UTC', ...opts });
  const monthTitle = new Date(Date.UTC(month.year, month.month, 15)).toLocaleDateString(intl, {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
  const weekdays = t('weekdays').split(',');

  function shiftMonth(delta: number) {
    update({ month: monthKey(month.year, month.month + delta), date: null });
  }

  function itemRow(item: CalendarItem) {
    return (
      <li key={item.id} className={`${styles.item} ${styles[`kind${item.kind}`]}`}>
        <span className={styles.itemTime}>{fmtTime(item.startsAt)}</span>
        <div className={styles.itemBody}>
          <div className={styles.itemHead}>
            <Badge tone={KIND_TONE[item.kind]}>{t(`kind.${item.kind}`)}</Badge>
            {item.done !== null && (
              <Badge tone={item.done ? 'success' : 'neutral'}>
                {item.done ? t('status.done') : t('status.pending')}
              </Badge>
            )}
          </div>
          <Link href={item.link} className={styles.itemTitle}>
            {item.title}
          </Link>
          <span className={styles.itemCourse}>{item.courseTitle}</span>
          {item.description && <p className={styles.itemDesc}>{item.description}</p>}
        </div>
        {item.canEdit && (
          <div className={styles.itemActions}>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`${t('actions.edit')}: ${item.title}`}
              onClick={() => {
                setEditing(item);
                setFormOpen(true);
              }}
            >
              <Pencil size={16} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`${t('actions.delete')}: ${item.title}`}
              onClick={() => setDeleting(item)}
            >
              <Trash2 size={16} aria-hidden="true" />
            </Button>
          </div>
        )}
      </li>
    );
  }

  const canCreate = (data?.canCreateIn.length ?? 0) > 0;

  return (
    <div className="container">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <>
            <Button variant="outline" onClick={() => setSubscribeOpen(true)}>
              <Link2 size={16} aria-hidden="true" /> {t('actions.subscribe')}
            </Button>
            {canCreate && (
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <CalendarPlus size={16} aria-hidden="true" /> {t('actions.add')}
              </Button>
            )}
          </>
        }
      />

      <div className={styles.toolbar}>
        <Segmented<View>
          label={t('view.label')}
          value={view}
          onChange={(v) => update({ view: v === 'month' ? null : v })}
          items={[
            { value: 'month', label: t('view.month') },
            { value: 'agenda', label: t('view.agenda') },
          ]}
        />
        {view === 'month' && (
          <div className={styles.monthNav}>
            <Button variant="ghost" size="sm" aria-label={t('nav.prev')} onClick={() => shiftMonth(-1)}>
              <ChevronLeft size={18} aria-hidden="true" />
            </Button>
            <h2 className={styles.monthTitle} aria-live="polite">
              {monthTitle}
            </h2>
            <Button variant="ghost" size="sm" aria-label={t('nav.next')} onClick={() => shiftMonth(1)}>
              <ChevronRight size={18} aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => update({ month: null, date: today })}
            >
              {t('nav.today')}
            </Button>
          </div>
        )}
        {(data?.courses.length ?? 0) > 1 && (
          <label className={styles.filter}>
            <span className="sr-only">{t('filter.label')}</span>
            <Select value={courseFilter} onChange={(e) => update({ course: e.target.value || null })}>
              <option value="">{t('filter.all')}</option>
              {data!.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
          </label>
        )}
      </div>

      {isLoading ? (
        <Skeleton height={520} radius="var(--radius-lg)" />
      ) : isError || !data ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : view === 'month' ? (
        <>
          <div className={styles.grid} role="grid" aria-label={monthTitle}>
            <div className={styles.weekRow} role="row">
              {weekdays.map((d) => (
                <span key={d} className={styles.weekday} role="columnheader">
                  {d}
                </span>
              ))}
            </div>
            {Array.from({ length: 6 }, (_, w) => (
              <div className={styles.weekRow} role="row" key={w}>
                {grid.slice(w * 7, w * 7 + 7).map((key) => {
                  const dayItems = byDay.get(key) ?? [];
                  const outside = monthOf(key) !== monthKey(month.year, month.month);
                  const isToday = key === today;
                  const isSelected = key === selected;
                  const fullDate = fmtDay(key, { day: 'numeric', month: 'long', weekday: 'long' });
                  return (
                    <div role="gridcell" key={key} className={styles.cellWrap}>
                      <button
                        type="button"
                        className={`${styles.cell} ${outside ? styles.outside : ''} ${isToday ? styles.today : ''} ${isSelected ? styles.selected : ''}`}
                        aria-pressed={isSelected}
                        aria-current={isToday ? 'date' : undefined}
                        aria-label={t('day.label', { date: fullDate, count: dayItems.length })}
                        onClick={() => update({ date: isSelected ? null : key })}
                      >
                        <span className={styles.dayNum}>{Number(key.slice(8))}</span>
                        <span className={styles.chips} aria-hidden="true">
                          {dayItems.slice(0, MAX_CHIPS).map((i) => (
                            <span
                              key={i.id}
                              className={`${styles.chip} ${styles[`kind${i.kind}`]} ${i.done ? styles.chipDone : ''}`}
                              title={`${t(`kind.${i.kind}`)}: ${i.title}`}
                            >
                              {i.title}
                            </span>
                          ))}
                          {dayItems.length > MAX_CHIPS && (
                            <span className={styles.more}>
                              {t('more', { count: dayItems.length - MAX_CHIPS })}
                            </span>
                          )}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <ul className={styles.legend} aria-label={t('view.label')}>
            {(Object.keys(KIND_TONE) as (keyof typeof KIND_TONE)[]).map((k) => (
              <li key={k}>
                <span className={`${styles.swatch} ${styles[`kind${k}`]}`} aria-hidden="true" />
                {t(`kind.${k}`)}
              </li>
            ))}
          </ul>

          {selected && (
            <section className={styles.dayPanel} aria-labelledby="day-panel-title">
              <h2 id="day-panel-title" className={styles.dayTitle}>
                {t('day.selected', { date: fmtDay(selected, { day: 'numeric', month: 'long', weekday: 'long' }) })}
              </h2>
              {(byDay.get(selected) ?? []).length === 0 ? (
                <p className={styles.muted}>{t('day.empty')}</p>
              ) : (
                <ul className={styles.list}>{(byDay.get(selected) ?? []).map(itemRow)}</ul>
              )}
            </section>
          )}
        </>
      ) : items.length === 0 ? (
        <EmptyState icon={<CalendarDays size={28} aria-hidden="true" />} title={t('agenda.empty')}>
          <p className={styles.muted}>{t('agenda.emptyHint')}</p>
        </EmptyState>
      ) : (
        <div className={styles.agenda}>
          {[...byDay.entries()].map(([key, list]) => (
            <section key={key} className={styles.agendaDay} aria-label={fmtDay(key, { day: 'numeric', month: 'long' })}>
              <h2 className={`${styles.agendaDate} ${key === today ? styles.agendaToday : ''}`}>
                {fmtDay(key, { weekday: 'long', day: 'numeric', month: 'long' })}
                {key === today && <span className={styles.todayTag}>{t('day.today')}</span>}
              </h2>
              <ul className={styles.list}>{list.map(itemRow)}</ul>
            </section>
          ))}
        </div>
      )}

      {data && (
        <EventFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          courses={data.canCreateIn}
          preferredCourseId={courseFilter}
          event={editing}
          defaultDate={selected ?? undefined}
        />
      )}
      <SubscribeModal open={subscribeOpen} onClose={() => setSubscribeOpen(false)} />
      <ConfirmDialog
        open={!!deleting}
        title={t('confirmDelete.title')}
        description={deleting ? t('confirmDelete.text', { title: deleting.title }) : undefined}
        confirmLabel={t('confirmDelete.confirm')}
        danger
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
