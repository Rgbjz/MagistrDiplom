import type { CalendarItem } from '../../lib/types';

/** All calendar math happens in the platform's time zone. */
export const CALENDAR_TZ = 'Europe/Kyiv';

const keyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: CALENDAR_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "2026-11-15" — the Kyiv calendar day of an instant. */
export function dayKey(value: string | Date): string {
  return keyFormat.format(new Date(value));
}

export function todayKey(): string {
  return dayKey(new Date());
}

/** "2026-11" for a day key. */
export function monthOf(key: string): string {
  return key.slice(0, 7);
}

export function parseMonth(value: string | null): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? '');
  if (!m) return null;
  const month = Number(m[2]) - 1;
  return month >= 0 && month < 12 ? { year: Number(m[1]), month } : null;
}

export function monthKey(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function keyFromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 6×7 grid of day keys starting on Monday, covering the month. */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(Date.UTC(year, month, 1 - offset));
  return Array.from({ length: 42 }, (_, i) =>
    keyFromUtc(new Date(start.getTime() + i * 86_400_000)),
  );
}

/** ISO range [from, to) wide enough for a grid (a day of margin for time zones). */
export function gridRange(grid: string[]): { from: string; to: string } {
  const from = new Date(`${grid[0]}T00:00:00Z`).getTime() - 86_400_000;
  const to = new Date(`${grid[grid.length - 1]}T00:00:00Z`).getTime() + 2 * 86_400_000;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

export function groupByDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const key = dayKey(item.startsAt);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

/** <input type="datetime-local"> value for an ISO instant, in the browser's zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
