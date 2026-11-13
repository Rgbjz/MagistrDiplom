import {
  assignmentStats,
  choiceCorrect,
  gradeDistribution,
  hardQuestions,
  latest,
  riskFlags,
  testStats,
  weeklyActivity,
  type QuestionMeta,
} from './analytics.compute';
import { DEFAULT_ECTS, DEFAULT_FIVE_POINT } from '../gradebook/grading-scale';

const NOW = new Date('2026-11-13T12:00:00Z'); // Friday
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 3600 * 1000);

describe('gradeDistribution', () => {
  it('groups percent finals into four buckets, lowest first', () => {
    const d = gradeDistribution(
      [10, 59, 60, 74.9, 75, 95, 100, null],
      'PERCENT',
      null,
      60,
    );
    expect(d.buckets.map((b) => [b.code, b.count, b.passing])).toEqual([
      ['0-59', 2, false],
      ['60-74', 2, true],
      ['75-89', 1, true],
      ['90-100', 2, true],
    ]);
    expect(d.ungraded).toBe(1);
  });

  it('uses the five-point and ECTS bands of the course', () => {
    const five = gradeDistribution(
      [95, 80, 61, 40],
      'FIVE_POINT',
      DEFAULT_FIVE_POINT,
      60,
    );
    expect(five.buckets.map((b) => `${b.code}:${b.count}`)).toEqual([
      '2:1',
      '3:1',
      '4:1',
      '5:1',
    ]);
    const ects = gradeDistribution([91, 50, 20], 'ECTS', DEFAULT_ECTS, 60);
    expect(ects.buckets.map((b) => b.code)).toEqual([
      'F',
      'FX',
      'E',
      'D',
      'C',
      'B',
      'A',
    ]);
    expect(ects.buckets.find((b) => b.code === 'FX')).toMatchObject({
      count: 1,
      passing: false,
    });
    expect(ects.buckets.find((b) => b.code === 'A')).toMatchObject({
      count: 1,
      passing: true,
    });
  });

  it('splits pass/fail at the course threshold', () => {
    const d = gradeDistribution([59, 60, 90, null], 'PASS_FAIL', null, 60);
    expect(d.buckets).toEqual([
      { code: 'FAIL', count: 1, passing: false },
      { code: 'PASS', count: 2, passing: true },
    ]);
    expect(d.ungraded).toBe(1);
  });
});

describe('hard questions', () => {
  const meta = new Map<number, QuestionMeta>(
    [1, 2, 3].map((id) => [
      id,
      {
        id,
        text: `Q${id}`,
        type: 'SINGLE',
        testId: 7,
        testTitle: 'T',
        lessonId: 70,
      },
    ]),
  );

  it('ranks questions by the share of correct answers', () => {
    const outcomes = [
      { questionId: 1, correct: true },
      { questionId: 1, correct: true },
      { questionId: 2, correct: false },
      { questionId: 2, correct: true },
      { questionId: 3, correct: false },
      { questionId: 99, correct: false }, // deleted question: ignored
    ];
    const rows = hardQuestions(outcomes, meta);
    expect(rows.map((r) => [r.id, r.correctRate, r.attempts])).toEqual([
      [3, 0, 1],
      [2, 50, 2],
      [1, 100, 2],
    ]);
    expect(hardQuestions(outcomes, meta, 1)).toHaveLength(1);
  });

  it('a choice question is right only with exactly the correct options', () => {
    expect(choiceCorrect([1], [1])).toBe(true);
    expect(choiceCorrect([2, 1], [1, 2])).toBe(true);
    expect(choiceCorrect([1], [1, 2])).toBe(false);
    expect(choiceCorrect([1, 3], [1])).toBe(false);
    expect(choiceCorrect([1], [])).toBe(false);
  });
});

describe('tests and labs tables', () => {
  it('test attempts, average and pass rate ignore essays awaiting review', () => {
    const [t] = testStats(
      [{ id: 1, title: 'T', lessonId: 10 }],
      [
        { testId: 1, userId: 1, score: 40, passed: false },
        { testId: 1, userId: 1, score: 80, passed: true },
        { testId: 1, userId: 2, score: 90, passed: null },
        { testId: 2, userId: 2, score: 0, passed: false },
      ],
    );
    expect(t).toMatchObject({
      attempts: 3,
      students: 2,
      avgScore: 70,
      passRate: 50,
    });
  });

  it('lab counts: awaiting, graded, returned and overdue students', () => {
    const [past, future] = assignmentStats(
      [
        { id: 1, title: 'Lab 1', lessonId: 1, maxScore: 10, dueAt: daysAgo(1) },
        {
          id: 2,
          title: 'Lab 2',
          lessonId: 2,
          maxScore: 10,
          dueAt: daysAgo(-5),
        },
      ],
      [
        { assignmentId: 1, userId: 1, status: 'GRADED', score: 9 },
        { assignmentId: 1, userId: 2, status: 'SUBMITTED', score: null },
        { assignmentId: 1, userId: 3, status: 'RETURNED', score: null },
        { assignmentId: 2, userId: 1, status: 'GRADED', score: 6 },
      ],
      [1, 2, 3, 4, 5],
      NOW,
    );
    expect(past).toMatchObject({
      submitted: 3,
      awaiting: 1,
      graded: 1,
      returned: 1,
      overdue: 2,
      avgScore: 9,
    });
    expect(future).toMatchObject({ overdue: 0, avgScore: 6 });
  });
});

describe('students at risk', () => {
  const base = {
    enrolledAt: daysAgo(30),
    progress: 80,
    final: 85,
    lastActivity: daysAgo(1),
    overdue: 0,
  };

  it('a student who is doing fine has no flags', () => {
    expect(riskFlags(base, 60, NOW)).toEqual([]);
  });

  it('flags low progress only after two weeks in the course', () => {
    expect(riskFlags({ ...base, progress: 10 }, 60, NOW)).toEqual([
      'lowProgress',
    ]);
    expect(
      riskFlags(
        {
          ...base,
          progress: 10,
          enrolledAt: daysAgo(5),
          lastActivity: daysAgo(1),
        },
        60,
        NOW,
      ),
    ).toEqual([]);
  });

  it('flags a failing grade, inactivity and overdue labs', () => {
    expect(
      riskFlags(
        { ...base, final: 40, lastActivity: daysAgo(20), overdue: 2 },
        60,
        NOW,
      ),
    ).toEqual(['lowGrade', 'inactive', 'overdue']);
  });

  it('with no activity at all, counts from the enrollment date', () => {
    expect(
      riskFlags(
        { ...base, lastActivity: null, enrolledAt: daysAgo(3), progress: 0 },
        60,
        NOW,
      ),
    ).toEqual([]);
    expect(
      riskFlags(
        { ...base, lastActivity: null, enrolledAt: daysAgo(20) },
        60,
        NOW,
      ),
    ).toEqual(['inactive']);
  });

  it('latest() picks the most recent moment', () => {
    expect(latest([null, daysAgo(3), undefined, daysAgo(1)])).toEqual(
      daysAgo(1),
    );
    expect(latest([])).toBeNull();
  });
});

describe('weekly activity', () => {
  it('buckets events by ISO week, oldest first, current week last', () => {
    const rows = weeklyActivity(
      [
        { kind: 'lesson', at: new Date('2026-11-09T08:00:00Z') }, // this Monday
        { kind: 'lesson', at: new Date('2026-11-13T08:00:00Z') },
        { kind: 'test', at: new Date('2026-11-08T23:00:00Z') }, // last Sunday
        { kind: 'submission', at: new Date('2026-08-01T10:00:00Z') }, // too old
        { kind: 'test', at: new Date('2026-12-01T10:00:00Z') }, // future
      ],
      NOW,
      4,
    );
    expect(rows.map((r) => r.weekStart)).toEqual([
      '2026-10-19',
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
    ]);
    expect(rows[3]).toMatchObject({ lessons: 2, tests: 0, submissions: 0 });
    expect(rows[2]).toMatchObject({ lessons: 0, tests: 1 });
    expect(rows.reduce((n, r) => n + r.submissions, 0)).toBe(0);
  });
});
