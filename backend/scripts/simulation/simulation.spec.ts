import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ADAPTIVE_CONFIG,
  ADAPTIVE_CONFIG_V2,
  ADAPTIVE_CONFIG_V3,
} from '../../src/modules/adaptive/adaptive.algorithm';
import { analyzeExport, parseExport } from './analyze-export';
import { selectCandidate, V2_CANDIDATES, V3_CANDIDATES } from './candidates';
import { runCohort } from './experiment';
import {
  makeCourse,
  makeLearner,
  pAnswer,
  postTest,
  SIM_CONFIG,
  studyLesson,
} from './model';
import { runLearner } from './policies';
import { beta, childSeed, mulberry32 } from './prng';
import { cohensD, mannWhitney, mean, tTwoSided, welch } from './stats';

describe('simulation: PRNG', () => {
  it('is deterministic for a seed and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(childSeed(1, 2, 3)).toBe(childSeed(1, 2, 3));
    expect(childSeed(1, 2, 3)).not.toBe(childSeed(1, 3, 2));
  });

  it('samples Beta(a, b) with the right mean', () => {
    const rng = mulberry32(7);
    const xs = Array.from({ length: 20000 }, () => beta(rng, 2, 8));
    expect(mean(xs)).toBeCloseTo(0.2, 2);
  });
});

describe('simulation: learner model', () => {
  it('answer probability is bounded by guess/slip and grows with knowledge', () => {
    const { guess, slip } = SIM_CONFIG.answer;
    expect(pAnswer(0, 3)).toBeGreaterThanOrEqual(guess);
    expect(pAnswer(1, -3)).toBeLessThanOrEqual(1 - slip);
    expect(pAnswer(0.8, 0)).toBeGreaterThan(pAnswer(0.4, 0));
    expect(pAnswer(0.5, -1)).toBeGreaterThan(pAnswer(0.5, 1));
  });

  it('repeated study of a lesson has diminishing returns', () => {
    const course = makeCourse(mulberry32(1));
    const l = makeLearner(mulberry32(2), 5, 'average');
    const lesson = course.lessons[0];
    const g1 = studyLesson(l, lesson);
    const g2 = studyLesson(l, lesson);
    const g3 = studyLesson(l, lesson);
    expect(g1).toBeGreaterThan(g2);
    expect(g2).toBeGreaterThan(g3);
    expect(l.clock).toBe(3 * SIM_CONFIG.time.lesson);
  });

  it('forgets the learned part over time (not below the prior)', () => {
    const course = makeCourse(mulberry32(1));
    const l = makeLearner(mulberry32(3), 5, 'weak');
    studyLesson(l, course.lessons[0]);
    const learned = l.k[0];
    l.clock += 3000;
    postTest(l, course, mulberry32(4)); // applies forgetting up to now
    expect(l.k[0]).toBeLessThan(learned);
    expect(l.k[0]).toBeGreaterThanOrEqual(l.base[0]);
  });
});

describe('simulation: policies', () => {
  const run = (policy: 'ADAPTIVE' | 'CONTROL', seed: number) => {
    const course = makeCourse(mulberry32(10));
    const learner = makeLearner(mulberry32(seed), 5);
    return runLearner({
      policy,
      course,
      learner,
      rng: mulberry32(seed + 1),
      calibration: new Map(),
    });
  };

  it('is reproducible and respects the time budget', () => {
    for (const policy of ['ADAPTIVE', 'CONTROL'] as const) {
      const a = run(policy, 5);
      expect(run(policy, 5)).toEqual(a);
      const minutes =
        a.lessonsStudied * SIM_CONFIG.time.lesson +
        a.questionsAnswered * SIM_CONFIG.time.question;
      expect(minutes).toBeLessThanOrEqual(SIM_CONFIG.budget);
    }
  });

  it('control follows the linear course path before revising', () => {
    const log = run('CONTROL', 6);
    expect(log.actions.LESSON).toBe(
      SIM_CONFIG.course.topics * SIM_CONFIG.course.lessonsPerTopic,
    );
    expect(log.actions.TEST).toBeGreaterThanOrEqual(SIM_CONFIG.course.topics);
  });

  it('adaptive policy acts only through the module recommendations', () => {
    const log = run('ADAPTIVE', 7);
    const allowed = [
      'NEXT',
      'REVIEW',
      'RETRY_TEST',
      'SKIP_AHEAD',
      'CHALLENGE',
      'DEADLINE',
      'PRACTICE',
    ];
    expect(Object.keys(log.actions).every((a) => allowed.includes(a))).toBe(
      true,
    );
    expect(log.actions.NEXT).toBeGreaterThan(0);
  });

  it('a cohort splits arms evenly and calibrates item difficulty', () => {
    const res = runCohort({ seed: 3, perArm: 60 });
    expect(res.rows.filter((r) => r.policy === 'ADAPTIVE')).toHaveLength(60);
    expect(res.rows.filter((r) => r.policy === 'CONTROL')).toHaveLength(60);
    expect(res.calibrationCorr).toBeGreaterThan(0.5);
  });
});

describe('simulation: statistics', () => {
  it('t distribution p-value matches reference values', () => {
    expect(tTwoSided(2, 10)).toBeCloseTo(0.0734, 3);
    expect(tTwoSided(0, 30)).toBeCloseTo(1, 6);
    expect(tTwoSided(1.96, 1e6)).toBeCloseTo(0.05, 3);
  });

  it('Welch, Mann–Whitney and Cohen d agree on a clear difference', () => {
    const a = Array.from({ length: 40 }, (_, i) => 10 + (i % 5));
    const b = Array.from({ length: 40 }, (_, i) => 5 + (i % 5));
    expect(welch(a, b).p).toBeLessThan(1e-6);
    const mw = mannWhitney(a, b);
    expect(mw.p).toBeLessThan(1e-6);
    expect(mw.cles).toBe(1);
    expect(cohensD(a, b)).toBeGreaterThan(2);
    expect(welch(a, a).p).toBeCloseTo(1, 6);
  });

  it('analyses the real pilot export (BOM, CRLF, empty cells)', () => {
    const text =
      '\uFEFFstudent,group,pre_score,post_score,gain\r\n' +
      'S01,ADAPTIVE,40,80,40\r\nS02,ADAPTIVE,50,85,35\r\nS03,ADAPTIVE,45,,\r\n' +
      'S04,CONTROL,40,60,20\r\nS05,CONTROL,55,70,15\r\n';
    const rows = parseExport(text);
    expect(rows).toHaveLength(5);
    const [gain] = analyzeExport(rows, ['gain']);
    expect(gain.nA).toBe(2);
    expect(gain.nC).toBe(2);
    expect(gain.diff).toBeCloseTo(20, 6);
  });
});

describe('simulation: v2 selection', () => {
  it('the app ships exactly the candidate selected on training seeds', () => {
    const summary = JSON.parse(
      readFileSync(join(__dirname, 'out', 'summary.json'), 'utf8'),
    ) as {
      v2: { chosen: string };
      v3: { chosen: string; decision: { v3BetterThanV2: boolean } };
    };
    const chosen = V2_CANDIDATES.find((c) => c.id === summary.v2.chosen);
    expect(chosen).toBeDefined();
    expect(ADAPTIVE_CONFIG_V2).toEqual(chosen!.cfg);
    // v3 ships only because the pre-registered rule said it beats v2.
    const v3 = V3_CANDIDATES.find((c) => c.id === summary.v3.chosen);
    expect(v3).toBeDefined();
    expect(summary.v3.decision.v3BetterThanV2).toBe(true);
    expect(ADAPTIVE_CONFIG_V3).toEqual(v3!.cfg);
    expect(ADAPTIVE_CONFIG).toBe(ADAPTIVE_CONFIG_V3);
  });

  it('selection: best d, ties within tolerance broken by calibration RMSE', () => {
    expect(
      selectCandidate([
        { id: 'A', d: -0.1, rmse: 0.2 },
        { id: 'B', d: -0.12, rmse: 0.15 },
        { id: 'C', d: -0.3, rmse: 0.1 },
      ]),
    ).toBe('B');
    expect(
      selectCandidate([
        { id: 'A', d: 0.2, rmse: 0.2 },
        { id: 'B', d: 0.1, rmse: 0.1 },
      ]),
    ).toBe('A');
  });
});
