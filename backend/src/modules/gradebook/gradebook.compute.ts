/**
 * Pure gradebook arithmetic (no I/O) so the rules are easy to test:
 * - test cell = best finished attempt, in percent;
 * - assignment cell = graded score, in points (percent = score / maxScore);
 * - missing or ungraded work counts as 0 in the averages: the final grade
 *   reflects the whole course, not only what was handed in;
 * - categories without items drop out and the remaining weight is renormalised;
 * - manual overrides by course staff replace the computed cell / final value;
 * - the pass flag follows the course grading scale.
 */

import {
  scaleGrade,
  type GradingScaleKind,
  type ScaleGrade,
} from './grading-scale';

export type CellState =
  | 'graded'
  | 'submitted'
  | 'returned'
  | 'missing'
  | 'late';

export interface GradebookColumn {
  key: string;
  kind: 'test' | 'assignment';
  id: number;
  title: string;
  sectionTitle: string;
  max: number;
  dueAt?: string | null;
}

/** Set when staff replaced the computed value by hand. */
export interface OverrideMark {
  value: number;
  /** Computed value it replaces (null when nothing was graded yet). */
  original: number | null;
  reason: string;
  by: string;
  at: string;
}

export interface GradebookCell {
  value: number | null;
  state: CellState;
  late?: boolean;
  overridden?: OverrideMark;
}

export interface GradebookRow {
  userId: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  status: string;
  cells: Record<string, GradebookCell>;
  testsAvg: number | null;
  assignmentsAvg: number | null;
  final: number | null;
  finalOverridden?: OverrideMark;
  scaleGrade: ScaleGrade | null;
  passed: boolean;
  progress: number;
}

export interface GradebookStats {
  studentsCount: number;
  avgFinal: number | null;
  passRate: number | null;
  perColumn: Record<string, { avg: number | null; submitted: number }>;
}

export interface GradeSettings {
  testsWeight: number;
  assignmentsWeight: number;
  gradePassThreshold: number;
  gradingScale?: GradingScaleKind;
  gradingScaleConfig?: unknown;
}

export interface OverrideInput {
  userId: number;
  /** 'test-<id>' | 'assignment-<id>' | 'final' */
  itemKey: string;
  value: number;
  reason: string;
  by: string;
  at: Date;
}

export interface StructureInput {
  sections: {
    title: string;
    lessons: {
      test: { id: number; title: string } | null;
      assignment: {
        id: number;
        title: string;
        maxScore: number;
        dueAt: Date | null;
      } | null;
    }[];
  }[];
}

export interface StudentInput {
  userId: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  status: string;
  progress: number;
}

export interface ResultInput {
  userId: number;
  testId: number;
  score: number | null;
  finishedAt: Date | null;
  /** Essay answers await manual grading — the score is provisional. */
  pendingReview?: boolean;
}

export interface SubmissionInput {
  userId: number;
  assignmentId: number;
  status: 'SUBMITTED' | 'GRADED' | 'RETURNED';
  score: number | null;
  late: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

export function buildColumns(structure: StructureInput): GradebookColumn[] {
  const cols: GradebookColumn[] = [];
  for (const section of structure.sections) {
    for (const lesson of section.lessons) {
      if (lesson.test) {
        cols.push({
          key: `test-${lesson.test.id}`,
          kind: 'test',
          id: lesson.test.id,
          title: lesson.test.title,
          sectionTitle: section.title,
          max: 100,
        });
      }
      if (lesson.assignment) {
        cols.push({
          key: `assignment-${lesson.assignment.id}`,
          kind: 'assignment',
          id: lesson.assignment.id,
          title: lesson.assignment.title,
          sectionTitle: section.title,
          max: lesson.assignment.maxScore,
          dueAt: lesson.assignment.dueAt
            ? lesson.assignment.dueAt.toISOString()
            : null,
        });
      }
    }
  }
  return cols;
}

/** Weighted final grade; null when the course has nothing to grade. */
export function finalGrade(
  testsAvg: number | null,
  assignmentsAvg: number | null,
  settings: GradeSettings,
): number | null {
  const parts: { avg: number; weight: number }[] = [];
  if (testsAvg !== null)
    parts.push({ avg: testsAvg, weight: settings.testsWeight });
  if (assignmentsAvg !== null)
    parts.push({ avg: assignmentsAvg, weight: settings.assignmentsWeight });
  if (parts.length === 0) return null;
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  // Every remaining category has weight 0: fall back to a plain average.
  if (totalWeight === 0) return round1(mean(parts.map((p) => p.avg)) as number);
  return round1(parts.reduce((s, p) => s + p.avg * p.weight, 0) / totalWeight);
}

export function computeGradebook(input: {
  settings: GradeSettings;
  structure: StructureInput;
  students: StudentInput[];
  results: ResultInput[];
  submissions: SubmissionInput[];
  overrides?: OverrideInput[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const columns = buildColumns(input.structure);
  const testCols = columns.filter((c) => c.kind === 'test');
  const assignmentCols = columns.filter((c) => c.kind === 'assignment');

  // Best finished attempt per (user, test).
  const best = new Map<string, number>();
  const pending = new Set<string>();
  for (const r of input.results) {
    if (!r.finishedAt || r.score === null) continue;
    const k = `${r.userId}:${r.testId}`;
    if (r.pendingReview) {
      pending.add(k);
      continue;
    }
    best.set(k, Math.max(best.get(k) ?? -1, r.score));
  }
  const subs = new Map<string, SubmissionInput>();
  for (const s of input.submissions)
    subs.set(`${s.userId}:${s.assignmentId}`, s);
  const overrides = new Map<string, OverrideInput>();
  for (const o of input.overrides ?? [])
    overrides.set(`${o.userId}:${o.itemKey}`, o);
  const mark = (o: OverrideInput, original: number | null): OverrideMark => ({
    value: o.value,
    original,
    reason: o.reason,
    by: o.by,
    at: o.at.toISOString(),
  });
  const scale = input.settings.gradingScale ?? 'PERCENT';

  const rows: GradebookRow[] = input.students.map((st) => {
    const cells: Record<string, GradebookCell> = {};
    for (const c of testCols) {
      const k = `${st.userId}:${c.id}`;
      const v = best.get(k);
      cells[c.key] =
        v !== undefined
          ? { value: v, state: 'graded' }
          : pending.has(k)
            ? { value: null, state: 'submitted' }
            : { value: null, state: 'missing' };
    }
    for (const c of assignmentCols) {
      const s = subs.get(`${st.userId}:${c.id}`);
      if (!s) {
        const overdue = !!c.dueAt && new Date(c.dueAt) < now;
        cells[c.key] = { value: null, state: overdue ? 'late' : 'missing' };
      } else if (s.status === 'GRADED') {
        cells[c.key] = { value: s.score ?? 0, state: 'graded', late: s.late };
      } else {
        cells[c.key] = {
          value: null,
          state: s.status === 'RETURNED' ? 'returned' : 'submitted',
          late: s.late,
        };
      }
    }
    // Manual corrections win over computed cells.
    for (const c of columns) {
      const o = overrides.get(`${st.userId}:${c.key}`);
      if (!o) continue;
      const cell = cells[c.key];
      cells[c.key] = {
        ...cell,
        value: o.value,
        state: 'graded',
        overridden: mark(o, cell.state === 'graded' ? cell.value : null),
      };
    }
    const testsAvg = testCols.length
      ? round1(mean(testCols.map((c) => cells[c.key].value ?? 0)) as number)
      : null;
    const assignmentsAvg = assignmentCols.length
      ? round1(
          mean(
            assignmentCols.map(
              (c) => ((cells[c.key].value ?? 0) / (c.max || 1)) * 100,
            ),
          ) as number,
        )
      : null;
    const computedFinal = finalGrade(testsAvg, assignmentsAvg, input.settings);
    const finalOverride = overrides.get(`${st.userId}:final`);
    const final = finalOverride ? finalOverride.value : computedFinal;
    const grade = scaleGrade(
      final,
      scale,
      input.settings.gradingScaleConfig,
      input.settings.gradePassThreshold,
    );
    return {
      ...st,
      cells,
      testsAvg,
      assignmentsAvg,
      final,
      ...(finalOverride
        ? { finalOverridden: mark(finalOverride, computedFinal) }
        : {}),
      scaleGrade: grade,
      passed: grade?.passed ?? false,
    };
  });

  const finals = rows
    .map((r) => r.final)
    .filter((f): f is number => f !== null);
  const perColumn: GradebookStats['perColumn'] = {};
  for (const c of columns) {
    const vals = rows
      .map((r) => r.cells[c.key].value)
      .filter((v): v is number => v !== null);
    const handedIn = rows.filter(
      (r) => !['missing', 'late'].includes(r.cells[c.key].state),
    ).length;
    perColumn[c.key] = {
      avg: vals.length ? round1(mean(vals) as number) : null,
      submitted: handedIn,
    };
  }
  const stats: GradebookStats = {
    studentsCount: rows.length,
    avgFinal: finals.length ? round1(mean(finals) as number) : null,
    passRate:
      rows.length && finals.length
        ? Math.round((rows.filter((r) => r.passed).length / rows.length) * 100)
        : null,
    perColumn,
  };
  return { columns, rows, stats };
}
