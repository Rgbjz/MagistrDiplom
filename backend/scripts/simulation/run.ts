/**
 * Simulation study (імітаційне моделювання) of the adaptation module.
 *   npm run sim            — full study (primary + ablations + sensitivity)
 *   npm run sim -- --quick — smaller run for a smoke check
 * Outputs: scripts/simulation/out/*.csv|json (raw_*.csv are git-ignored).
 * All randomness derives from MASTER_SEED, so results are reproducible.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  ADAPTIVE_CONFIG,
  type AdaptiveConfig,
} from '../../src/modules/adaptive/adaptive.algorithm';
import { runCohort, type LearnerRow } from './experiment';
import { SIM_CONFIG, type LearnerType, type SimConfig } from './model';
import type { Variant } from './policies';
import { childSeed, mulberry32 } from './prng';
import {
  compare,
  mean,
  quantile,
  welch,
  cohensD,
  type Comparison,
} from './stats';

export const MASTER_SEED = 20261114;

const quick = process.argv.includes('--quick');
const PRIMARY = { seeds: quick ? 3 : 20, perArm: quick ? 150 : 500 };
const SECONDARY = { seeds: quick ? 2 : 8, perArm: quick ? 100 : 300 };
const OUT = join(__dirname, 'out');
mkdirSync(OUT, { recursive: true });

const TYPES: LearnerType[] = ['weak', 'average', 'strong'];

/** Pre-registered primary/secondary metrics. */
const METRICS: { key: keyof LearnerRow | 'completed'; label: string }[] = [
  { key: 'postExpected', label: 'post-test (expected score)' },
  { key: 'postScore', label: 'post-test (observed score)' },
  { key: 'gain', label: 'learning gain (post − pre)' },
  { key: 'meanK', label: 'mean true knowledge' },
  { key: 'masteredShare', label: 'share of topics mastered (k ≥ 0.8)' },
  { key: 'completed', label: 'course completed (all topic tests passed)' },
  { key: 'lessonsStudied', label: 'lesson studies' },
  { key: 'wastedLessons', label: 'lesson studies on mastered topics' },
  { key: 'testsTaken', label: 'tests taken' },
  { key: 'questionsAnswered', label: 'questions answered' },
  { key: 'modelCorr', label: 'system model vs truth (Pearson r, per learner)' },
  { key: 'modelRmse', label: 'system model vs truth (RMSE)' },
];

const value = (r: LearnerRow, key: keyof LearnerRow | 'completed'): number =>
  key === 'completed' ? (r.completedAt !== null ? 1 : 0) : Number(r[key]);

interface Scenario {
  name: string;
  sim?: SimConfig;
  adaptive?: AdaptiveConfig;
  thresholds?: { masteryThreshold: number; accelerationThreshold: number };
  variant?: Variant;
}

function runScenario(
  s: Scenario,
  plan: { seeds: number; perArm: number },
  tag: number,
) {
  const rows: LearnerRow[] = [];
  const perSeed: {
    seed: number;
    d: number;
    p: number;
    dWeak: number;
    calCorr: number;
    thetaCorr: number;
  }[] = [];
  for (let i = 0; i < plan.seeds; i++) {
    const seed = childSeed(MASTER_SEED, tag, i);
    const res = runCohort({
      seed,
      perArm: plan.perArm,
      sim: s.sim,
      adaptive: s.adaptive,
      thresholds: s.thresholds,
      variant: s.variant,
    });
    rows.push(...res.rows);
    const A = res.rows.filter((r) => r.policy === 'ADAPTIVE');
    const C = res.rows.filter((r) => r.policy === 'CONTROL');
    const w = welch(
      A.map((r) => r.postExpected),
      C.map((r) => r.postExpected),
    );
    perSeed.push({
      seed,
      d: cohensD(
        A.map((r) => r.postExpected),
        C.map((r) => r.postExpected),
      ),
      p: w.p,
      dWeak: cohensD(
        A.filter((r) => r.type === 'weak').map((r) => r.postExpected),
        C.filter((r) => r.type === 'weak').map((r) => r.postExpected),
      ),
      calCorr: res.calibrationCorr,
      thetaCorr: res.thetaCorr,
    });
  }
  return { rows, perSeed };
}

function comparisons(
  rows: LearnerRow[],
  tag: number,
  metrics = METRICS,
): Comparison[] {
  const rng = mulberry32(childSeed(MASTER_SEED, 99, tag));
  const A = rows.filter((r) => r.policy === 'ADAPTIVE');
  const C = rows.filter((r) => r.policy === 'CONTROL');
  return metrics.map((m) =>
    compare(
      m.key,
      A.map((r) => value(r, m.key)),
      C.map((r) => value(r, m.key)),
      rng,
      quick ? 200 : 1000,
    ),
  );
}

const csv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return '';
  const head = Object.keys(rows[0]);
  const cell = (v: unknown): string => {
    if (typeof v === 'number')
      return Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : '';
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return v === null || v === undefined ? '' : JSON.stringify(v);
  };
  return (
    [
      head.join(','),
      ...rows.map((r) => head.map((h) => cell(r[h])).join(',')),
    ].join('\n') + '\n'
  );
};

const ACTIONS = [
  'NEXT',
  'REVIEW',
  'RETRY_TEST',
  'SKIP_AHEAD',
  'CHALLENGE',
  'PRACTICE',
  'LESSON',
  'TEST',
  'REVISION',
];
const flat = (r: LearnerRow) => {
  const { actions, ...rest } = r;
  return {
    ...rest,
    ...Object.fromEntries(ACTIONS.map((a) => [`n_${a}`, actions[a] ?? 0])),
  };
};

const t0 = Date.now();
const log = (msg: string) =>
  console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

// ── 1. Primary analysis: the deployed module with default parameters ──
log(`primary: ${PRIMARY.seeds} seeds × ${PRIMARY.perArm} learners per arm`);
const primary = runScenario({ name: 'primary' }, PRIMARY, 1);
writeFileSync(join(OUT, 'raw_primary.csv'), csv(primary.rows.map(flat)));
const primaryCmp = comparisons(primary.rows, 1);
writeFileSync(
  join(OUT, 'primary_comparisons.csv'),
  csv(primaryCmp as unknown as Record<string, unknown>[]),
);
writeFileSync(join(OUT, 'per_seed.csv'), csv(primary.perSeed));

// Subgroups (pre-specified): weak / average / strong learners.
const subgroupCmp = TYPES.flatMap((ty, i) =>
  comparisons(
    primary.rows.filter((r) => r.type === ty),
    10 + i,
    METRICS.filter((m) =>
      [
        'postExpected',
        'gain',
        'masteredShare',
        'completed',
        'wastedLessons',
      ].includes(m.key),
    ),
  ).map((c) => ({ type: ty, ...c })),
);
writeFileSync(join(OUT, 'subgroups.csv'), csv(subgroupCmp));

// A single representative experiment (first seed, 500 per arm), as a real study would report.
const firstSeed = primary.perSeed[0].seed;
const single = comparisons(
  primary.rows.filter((r) => r.seed === firstSeed),
  2,
  METRICS.slice(0, 6),
);
writeFileSync(
  join(OUT, 'single_experiment.csv'),
  csv(single as unknown as Record<string, unknown>[]),
);

// Action profile.
const actionProfile = (['ADAPTIVE', 'CONTROL'] as const).flatMap((p) =>
  TYPES.map((ty) => {
    const g = primary.rows.filter((r) => r.policy === p && r.type === ty);
    return {
      policy: p,
      type: ty,
      ...Object.fromEntries(
        ACTIONS.map((a) => [a, mean(g.map((r) => r.actions[a] ?? 0))]),
      ),
    };
  }),
);
writeFileSync(join(OUT, 'actions.csv'), csv(actionProfile));
log('primary done');

// ── 2. Ablations: proposed modifications (not the deployed module) ──
const ablations: Scenario[] = [
  { name: 'module (deployed)' },
  { name: 'evidence gate', variant: { evidenceGate: true } },
  { name: 'soft gating (reviewCap = 2)', variant: { reviewCap: 2 } },
  {
    name: 'evidence gate + soft gating',
    variant: { evidenceGate: true, reviewCap: 2 },
  },
  {
    name: 'per-topic Elo mastery + gate',
    variant: { masteryModel: 'elo', evidenceGate: true },
  },
  {
    name: 'Elo mastery + gate + soft gating',
    variant: { masteryModel: 'elo', evidenceGate: true, reviewCap: 2 },
  },
];
const ablationRows = ablations.flatMap((s, i) => {
  const r = i === 0 ? primary : runScenario(s, PRIMARY, 1); // same seeds → paired cohorts
  return summarise(s.name, r.rows, r.perSeed, 20 + i);
});
writeFileSync(join(OUT, 'ablations.csv'), csv(ablationRows));
log('ablations done');

function summarise(
  name: string,
  rows: LearnerRow[],
  perSeed: { d: number; p: number; dWeak: number }[],
  tag: number,
  extra: Record<string, unknown> = {},
) {
  const all = comparisons(rows, tag, METRICS.slice(0, 1))[0];
  const byType = Object.fromEntries(
    TYPES.map((ty) => {
      const c = comparisons(
        rows.filter((r) => r.type === ty),
        tag * 10 + TYPES.indexOf(ty),
        METRICS.slice(0, 1),
      )[0];
      return [`d_${ty}`, c.d];
    }),
  );
  const A = rows.filter((r) => r.policy === 'ADAPTIVE');
  const C = rows.filter((r) => r.policy === 'CONTROL');
  return {
    scenario: name,
    ...extra,
    meanA: all.meanA,
    meanC: all.meanC,
    d: all.d,
    dLo: all.dLo,
    dHi: all.dHi,
    pWelch: all.pWelch,
    ...byType,
    seedsPositiveSig: perSeed.filter((s) => s.d > 0 && s.p < 0.05).length,
    seedsNegativeSig: perSeed.filter((s) => s.d < 0 && s.p < 0.05).length,
    seeds: perSeed.length,
    wastedA: mean(A.map((r) => r.wastedLessons)),
    wastedC: mean(C.map((r) => r.wastedLessons)),
    completedA: mean(A.map((r) => value(r, 'completed'))),
    completedC: mean(C.map((r) => value(r, 'completed'))),
    modelCorrA: mean(A.map((r) => r.modelCorr).filter(Number.isFinite)),
  };
}

// ── 3. Sensitivity: one parameter at a time around the defaults ──
type Sens = { param: string; value: number | string; scenario: Scenario };
const withSim = (patch: Partial<SimConfig>): SimConfig => ({
  ...SIM_CONFIG,
  ...patch,
});
const withGain = (k: number): SimConfig => ({
  ...SIM_CONFIG,
  population: Object.fromEntries(
    Object.entries(SIM_CONFIG.population).map(([ty, p]) => [
      ty,
      { ...p, gain: p.gain * k },
    ]),
  ) as SimConfig['population'],
});
const withAlpha = (alpha: number) =>
  ({ ...ADAPTIVE_CONFIG, alpha }) as unknown as AdaptiveConfig;
const sens: Sens[] = [
  ...[0.5, 0.6, 0.7].map((v) => ({
    param: 'τ (mastery threshold)',
    value: v,
    scenario: {
      name: '',
      thresholds: { masteryThreshold: v, accelerationThreshold: 0.85 },
    },
  })),
  ...[0.15, 0.3, 0.5].map((v) => ({
    param: 'α (EWMA rate)',
    value: v,
    scenario: { name: '', adaptive: withAlpha(v) },
  })),
  ...[0.7, 1, 1.3].map((v) => ({
    param: 'learning rate ×',
    value: v,
    scenario: { name: '', sim: withGain(v) },
  })),
  ...[0, 1 / 3000, 1 / 1500, 1 / 750].map((v) => ({
    param: 'forgetting φ (1/min)',
    value: v,
    scenario: { name: '', sim: withSim({ forgettingPerMinute: v }) },
  })),
  ...[240, 360, 480, 600].map((v) => ({
    param: 'time budget (min)',
    value: v,
    scenario: { name: '', sim: withSim({ budget: v }) },
  })),
  ...[0.01, 0.03, 0.05].map((v) => ({
    param: 'testing effect',
    value: v,
    scenario: { name: '', sim: withSim({ testingGain: v }) },
  })),
];
const sensRows = sens.flatMap((s, i) =>
  (['module (deployed)', 'evidence gate + soft gating'] as const).map(
    (variantName, j) => {
      const scenario = {
        ...s.scenario,
        variant: j === 0 ? undefined : { evidenceGate: true, reviewCap: 2 },
      };
      const r = runScenario(scenario, SECONDARY, 100 + i);
      return summarise(variantName, r.rows, r.perSeed, 200 + i * 2 + j, {
        param: s.param,
        value: s.value,
      });
    },
  ),
);
writeFileSync(join(OUT, 'sensitivity.csv'), csv(sensRows));
log('sensitivity done');

// ── Summary ──
const ps = primary.perSeed;
const summary = {
  masterSeed: MASTER_SEED,
  plan: { primary: PRIMARY, secondary: SECONDARY },
  simConfig: SIM_CONFIG,
  adaptiveConfig: ADAPTIVE_CONFIG,
  primary: Object.fromEntries(primaryCmp.map((c) => [c.metric, c])),
  perSeed: {
    dMean: mean(ps.map((s) => s.d)),
    dP025: quantile(
      ps.map((s) => s.d),
      0.025,
    ),
    dP975: quantile(
      ps.map((s) => s.d),
      0.975,
    ),
    dWeakMean: mean(ps.map((s) => s.dWeak)),
    positiveSignificant: ps.filter((s) => s.d > 0 && s.p < 0.05).length,
    negativeSignificant: ps.filter((s) => s.d < 0 && s.p < 0.05).length,
    seeds: ps.length,
  },
  calibration: {
    itemDifficultyCorr: mean(ps.map((s) => s.calCorr)),
    thetaVsTrueKnowledgeCorr: mean(ps.map((s) => s.thetaCorr)),
  },
  ablations: ablationRows,
  runtimeSec: (Date.now() - t0) / 1000,
};
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
log(`done → ${OUT}`);
