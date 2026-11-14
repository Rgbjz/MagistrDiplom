/**
 * One simulated A/B experiment: a cohort of virtual learners split into
 * ADAPTIVE and CONTROL arms (alternating, so item calibration evolves for
 * both arms alike), each taking the same course under the same time budget,
 * then the same held-out post-test.
 */
import {
  ADAPTIVE_CONFIG_V1,
  type AdaptiveConfig,
  type Thresholds,
} from '../../src/modules/adaptive/adaptive.algorithm';
import {
  makeCourse,
  makeLearner,
  postTest,
  SIM_CONFIG,
  type LearnerType,
  type SimConfig,
} from './model';
import {
  runLearner,
  type CalibrationStore,
  type Policy,
  type Variant,
} from './policies';
import { childSeed, mulberry32 } from './prng';
import { pearson } from './stats';

export interface LearnerRow {
  seed: number;
  learner: number;
  policy: Policy;
  type: LearnerType;
  /** Pre-test (expected score before learning, on the held-out post-test items). */
  preScore: number;
  postScore: number;
  postExpected: number;
  gain: number;
  meanK: number;
  masteredShare: number;
  completedAt: number | null;
  allMasteredAt: number | null;
  lessonsStudied: number;
  wastedLessons: number;
  testsTaken: number;
  retakes: number;
  questionsAnswered: number;
  /** System model vs truth, per learner (5 topics). */
  modelCorr: number;
  modelRmse: number;
  meanSystemMastery: number;
  theta: number;
  /** Action counts (adaptive: recommendation types; control: LESSON/TEST/REVISION). */
  actions: Record<string, number>;
}

export interface CohortResult {
  rows: LearnerRow[];
  /** Elo-calibrated b vs true b of the practice pool at the end of the cohort. */
  calibrationCorr: number;
  calibrationRmse: number;
  /** Corr of the system's θ with the learner's true mean ability. */
  thetaCorr: number;
  /** System topic mastery vs true k, pooled over learners × topics, per arm. */
  pooledCorr: { ADAPTIVE: number; CONTROL: number };
}

export interface CohortOptions {
  seed: number;
  /** Learners per arm. */
  perArm: number;
  sim?: SimConfig;
  adaptive?: AdaptiveConfig;
  thresholds?: Thresholds;
  variant?: Variant;
}

export function runCohort(o: CohortOptions): CohortResult {
  const sim = o.sim ?? SIM_CONFIG;
  const cfg = o.adaptive ?? ADAPTIVE_CONFIG_V1;
  const course = makeCourse(mulberry32(childSeed(o.seed, 1)), sim);
  const calibration: CalibrationStore = new Map();
  const rows: LearnerRow[] = [];
  const thetaTruth: number[] = [];
  const thetaSys: number[] = [];
  const pairs = {
    ADAPTIVE: { sys: [] as number[], truth: [] as number[] },
    CONTROL: { sys: [] as number[], truth: [] as number[] },
  };

  for (let i = 0; i < o.perArm * 2; i++) {
    const policy: Policy = i % 2 === 0 ? 'ADAPTIVE' : 'CONTROL';
    const rngL = mulberry32(childSeed(o.seed, 2, i));
    const learner = makeLearner(rngL, sim.course.topics, undefined, sim);
    const pre = postTest(
      learner,
      course,
      mulberry32(childSeed(o.seed, 3, i)),
      sim,
    );
    const log = runLearner({
      policy,
      course,
      learner,
      rng: mulberry32(childSeed(o.seed, 4, i)),
      calibration,
      sim,
      adaptive: cfg,
      thresholds: o.thresholds,
      variant: o.variant,
    });
    const post = postTest(
      learner,
      course,
      mulberry32(childSeed(o.seed, 5, i)),
      sim,
    );
    const sys = log.mastery.map((m) => m.mastery);
    const meanK = learner.k.reduce((a, b) => a + b, 0) / learner.k.length;
    thetaTruth.push(meanK);
    thetaSys.push(log.theta);
    pairs[policy].sys.push(...sys);
    pairs[policy].truth.push(...learner.k);
    rows.push({
      seed: o.seed,
      learner: i,
      policy,
      type: learner.type,
      preScore: pre.expected,
      postScore: post.score,
      postExpected: post.expected,
      gain: post.expected - pre.expected,
      meanK,
      masteredShare:
        learner.k.filter((k) => k >= sim.masteredAt).length / learner.k.length,
      completedAt: log.completedAt,
      allMasteredAt: log.allMasteredAt,
      lessonsStudied: log.lessonsStudied,
      wastedLessons: log.wastedLessons,
      testsTaken: log.testsTaken,
      retakes: log.retakes,
      questionsAnswered: log.questionsAnswered,
      modelCorr: pearson(sys, learner.k),
      modelRmse: Math.sqrt(
        sys.reduce((a, m, t) => a + (m - learner.k[t]) ** 2, 0) / sys.length,
      ),
      meanSystemMastery: sys.reduce((a, b) => a + b, 0) / sys.length,
      theta: log.theta,
      actions: log.actions,
    });
  }

  const qs = course.pool.flat();
  const calB = qs.map((q) => calibration.get(q.id)?.b ?? NaN);
  const ok = qs.map((_, i) => !Number.isNaN(calB[i]));
  const trueB = qs.filter((_, i) => ok[i]).map((q) => q.b);
  const estB = calB.filter((_, i) => ok[i]);
  return {
    rows,
    calibrationCorr: pearson(estB, trueB),
    calibrationRmse: Math.sqrt(
      estB.reduce((a, b, i) => a + (b - trueB[i]) ** 2, 0) /
        Math.max(1, estB.length),
    ),
    thetaCorr: pearson(thetaSys, thetaTruth),
    pooledCorr: {
      ADAPTIVE: pearson(pairs.ADAPTIVE.sys, pairs.ADAPTIVE.truth),
      CONTROL: pearson(pairs.CONTROL.sys, pairs.CONTROL.truth),
    },
  };
}
