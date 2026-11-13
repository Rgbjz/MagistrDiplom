/**
 * Pure helpers behind the course analytics page: grade distribution, hard
 * questions, per-item stats, at-risk flags and weekly activity. The service
 * loads rows from the database and passes plain data here.
 */
import type { GradingScaleKind, ScaleBand } from '../gradebook/grading-scale';

const DAY = 24 * 60 * 60 * 1000;

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

// ───────────────────────────── distribution ─────────────────────────────

export interface DistributionBucket {
  /** Scale code: '0-59' … '90-100' (percent), '5'…'2', 'A'…'F', 'PASS'/'FAIL'. */
  code: string;
  count: number;
  /** The bucket counts as a pass on this scale. */
  passing: boolean;
}

export interface Distribution {
  buckets: DistributionBucket[];
  /** Students with no graded work yet. */
  ungraded: number;
}

const PERCENT_BUCKETS = [
  { code: '0-59', min: 0 },
  { code: '60-74', min: 60 },
  { code: '75-89', min: 75 },
  { code: '90-100', min: 90 },
];

const PASSING_CODES = new Set(['5', '4', '3', 'A', 'B', 'C', 'D', 'E']);

/**
 * Final grades grouped on the course scale, from the lowest bucket to the
 * highest. `bands` are the effective scale thresholds (null for % and
 * pass/fail).
 */
export function gradeDistribution(
  finals: (number | null)[],
  scale: GradingScaleKind,
  bands: ScaleBand[] | null,
  passThreshold: number,
): Distribution {
  const graded = finals.filter((f): f is number => f !== null);
  const ungraded = finals.length - graded.length;

  if (scale === 'PASS_FAIL') {
    const pass = graded.filter((f) => f >= passThreshold).length;
    return {
      buckets: [
        { code: 'FAIL', count: graded.length - pass, passing: false },
        { code: 'PASS', count: pass, passing: true },
      ],
      ungraded,
    };
  }

  const ladder =
    scale === 'PERCENT' || !bands
      ? PERCENT_BUCKETS
      : [...bands].sort((a, b) => a.min - b.min);
  const buckets = ladder.map((b, i) => {
    const next = ladder[i + 1]?.min ?? Infinity;
    return {
      code: b.code,
      count: graded.filter((f) => f >= b.min && f < next).length,
      passing:
        scale === 'PERCENT'
          ? b.min >= passThreshold
          : PASSING_CODES.has(b.code),
    };
  });
  return { buckets, ungraded };
}

// ───────────────────────────── questions ─────────────────────────────

export interface QuestionOutcome {
  questionId: number;
  correct: boolean;
}

export interface QuestionMeta {
  id: number;
  text: string;
  type: string;
  testId: number;
  testTitle: string;
  lessonId: number;
}

export interface HardQuestion extends QuestionMeta {
  attempts: number;
  /** Percent of attempts answered fully correctly. */
  correctRate: number;
}

/**
 * Whether an old-style attempt (answers stored as UserAnswer rows) got a
 * single/multiple-choice question right: exactly the correct options chosen.
 */
export function choiceCorrect(chosen: number[], correct: number[]): boolean {
  if (!correct.length) return false;
  const picked = new Set(chosen);
  return (
    picked.size === correct.length && correct.every((id) => picked.has(id))
  );
}

/** The `limit` questions with the lowest share of correct answers. */
export function hardQuestions(
  outcomes: QuestionOutcome[],
  meta: Map<number, QuestionMeta>,
  limit = 10,
): HardQuestion[] {
  const tally = new Map<number, { attempts: number; correct: number }>();
  for (const o of outcomes) {
    const t = tally.get(o.questionId) ?? { attempts: 0, correct: 0 };
    t.attempts += 1;
    if (o.correct) t.correct += 1;
    tally.set(o.questionId, t);
  }
  const rows: HardQuestion[] = [];
  for (const [id, t] of tally) {
    const m = meta.get(id);
    if (!m) continue;
    rows.push({
      ...m,
      attempts: t.attempts,
      correctRate: Math.round((t.correct / t.attempts) * 100),
    });
  }
  rows.sort(
    (a, b) =>
      a.correctRate - b.correctRate || b.attempts - a.attempts || a.id - b.id,
  );
  return rows.slice(0, limit);
}

// ───────────────────────────── tests & labs ─────────────────────────────

export interface TestResultInput {
  testId: number;
  userId: number;
  score: number | null;
  passed: boolean | null;
}

export interface TestStats {
  id: number;
  title: string;
  lessonId: number;
  attempts: number;
  students: number;
  avgScore: number | null;
  /** Percent of decided attempts that passed (essays awaiting review excluded). */
  passRate: number | null;
}

export function testStats(
  tests: { id: number; title: string; lessonId: number }[],
  results: TestResultInput[],
): TestStats[] {
  return tests.map((t) => {
    const mine = results.filter((r) => r.testId === t.id);
    const scores = mine
      .map((r) => r.score)
      .filter((s): s is number => s !== null);
    const decided = mine.filter((r) => r.passed !== null);
    const avg = mean(scores);
    return {
      id: t.id,
      title: t.title,
      lessonId: t.lessonId,
      attempts: mine.length,
      students: new Set(mine.map((r) => r.userId)).size,
      avgScore: avg === null ? null : round1(avg),
      passRate: decided.length
        ? Math.round(
            (decided.filter((r) => r.passed).length / decided.length) * 100,
          )
        : null,
    };
  });
}

export interface SubmissionInput {
  assignmentId: number;
  userId: number;
  status: 'SUBMITTED' | 'GRADED' | 'RETURNED';
  score: number | null;
}

export interface AssignmentStats {
  id: number;
  title: string;
  lessonId: number;
  maxScore: number;
  dueAt: Date | null;
  submitted: number;
  /** Handed in, not yet graded. */
  awaiting: number;
  graded: number;
  returned: number;
  /** Students with no hand-in after the deadline. */
  overdue: number;
  /** Average of graded scores, in points. */
  avgScore: number | null;
}

export function assignmentStats(
  assignments: {
    id: number;
    title: string;
    lessonId: number;
    maxScore: number;
    dueAt: Date | null;
  }[],
  submissions: SubmissionInput[],
  studentIds: number[],
  now: Date,
): AssignmentStats[] {
  return assignments.map((a) => {
    const mine = submissions.filter((s) => s.assignmentId === a.id);
    const handedIn = new Set(mine.map((s) => s.userId));
    const graded = mine.filter((s) => s.status === 'GRADED');
    const scores = graded
      .map((s) => s.score)
      .filter((s): s is number => s !== null);
    const avg = mean(scores);
    const pastDue = a.dueAt !== null && a.dueAt < now;
    return {
      ...a,
      submitted: mine.length,
      awaiting: mine.filter((s) => s.status === 'SUBMITTED').length,
      graded: graded.length,
      returned: mine.filter((s) => s.status === 'RETURNED').length,
      overdue: pastDue
        ? studentIds.filter((id) => !handedIn.has(id)).length
        : 0,
      avgScore: avg === null ? null : round1(avg),
    };
  });
}

// ───────────────────────────── students at risk ─────────────────────────────

export type RiskFlag = 'lowProgress' | 'lowGrade' | 'inactive' | 'overdue';

export interface RiskInput {
  enrolledAt: Date;
  progress: number;
  final: number | null;
  lastActivity: Date | null;
  overdue: number;
}

export const RISK_RULES = {
  /** Progress below this… */
  lowProgressPercent: 30,
  /** …after this many days in the course. */
  lowProgressAfterDays: 14,
  /** No activity for this many days. */
  inactiveDays: 14,
};

/** Reasons a student may need attention; empty when all is well. */
export function riskFlags(
  s: RiskInput,
  passThreshold: number,
  now: Date,
): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const daysIn = (now.getTime() - s.enrolledAt.getTime()) / DAY;
  if (
    s.progress < RISK_RULES.lowProgressPercent &&
    daysIn >= RISK_RULES.lowProgressAfterDays
  ) {
    flags.push('lowProgress');
  }
  if (s.final !== null && s.final < passThreshold) flags.push('lowGrade');
  const last = s.lastActivity ?? s.enrolledAt;
  if ((now.getTime() - last.getTime()) / DAY >= RISK_RULES.inactiveDays) {
    flags.push('inactive');
  }
  if (s.overdue > 0) flags.push('overdue');
  return flags;
}

/** Latest of the given moments (null when there are none). */
export function latest(dates: (Date | null | undefined)[]): Date | null {
  let best: Date | null = null;
  for (const d of dates) if (d && (!best || d > best)) best = d;
  return best;
}

// ───────────────────────────── weekly activity ─────────────────────────────

export type ActivityKind = 'lesson' | 'test' | 'submission';

export interface WeekActivity {
  /** Monday of the week, YYYY-MM-DD (UTC). */
  weekStart: string;
  lessons: number;
  tests: number;
  submissions: number;
}

function mondayUtc(d: Date): Date {
  const day = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const shift = (day.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(day.getTime() - shift * DAY);
}

/** Counts per week for the last `weeks` weeks, oldest first, current week last. */
export function weeklyActivity(
  events: { kind: ActivityKind; at: Date }[],
  now: Date,
  weeks = 12,
): WeekActivity[] {
  const current = mondayUtc(now);
  const rows: WeekActivity[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(current.getTime() - i * 7 * DAY);
    rows.push({
      weekStart: start.toISOString().slice(0, 10),
      lessons: 0,
      tests: 0,
      submissions: 0,
    });
  }
  const first = current.getTime() - (weeks - 1) * 7 * DAY;
  for (const e of events) {
    const t = e.at.getTime();
    if (t < first || t > now.getTime()) continue;
    const idx = Math.floor((mondayUtc(e.at).getTime() - first) / (7 * DAY));
    const row = rows[idx];
    if (!row) continue;
    if (e.kind === 'lesson') row.lessons += 1;
    else if (e.kind === 'test') row.tests += 1;
    else row.submissions += 1;
  }
  return rows;
}
