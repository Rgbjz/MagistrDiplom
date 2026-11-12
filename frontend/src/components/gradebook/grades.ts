import type { GradebookCell, GradebookColumn } from '../../lib/types';

type CellWord = 'submitted' | 'returned' | 'late';

/**
 * Short cell text: "85%" for tests, "40/50" for assignments, a status word
 * (translated via `word`, keys under gradebook.cell) otherwise.
 */
export function cellText(
  column: GradebookColumn,
  cell: GradebookCell | undefined,
  word: (key: CellWord) => string,
  comma = true,
): string {
  if (!cell) return '—';
  if (cell.state === 'graded' && cell.value !== null) {
    return column.kind === 'test'
      ? `${fmt(cell.value, comma)}%`
      : `${fmt(cell.value, comma)}/${column.max}`;
  }
  switch (cell.state) {
    case 'submitted':
    case 'returned':
    case 'late':
      return word(cell.state);
    default:
      return '—';
  }
}

/** One decimal at most; Ukrainian/Polish use a decimal comma, English a point. */
export function fmt(n: number, comma = true): string {
  if (Number.isInteger(n)) return String(n);
  const s = n.toFixed(1);
  return comma ? s.replace('.', ',') : s;
}

export function pct(n: number | null, comma = true): string {
  return n === null ? '—' : `${fmt(n, comma)}%`;
}

/** Columns grouped by section, keeping order (for the two-row table header). */
export function groupBySection(columns: GradebookColumn[]) {
  const groups: { title: string; columns: GradebookColumn[] }[] = [];
  for (const c of columns) {
    const last = groups[groups.length - 1];
    if (last && last.title === c.sectionTitle) last.columns.push(c);
    else groups.push({ title: c.sectionTitle, columns: [c] });
  }
  return groups;
}
