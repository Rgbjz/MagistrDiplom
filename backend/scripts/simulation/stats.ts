/**
 * Statistics without external dependencies: descriptive stats, Welch's
 * t-test, Mann–Whitney U, Cohen's d with a bootstrap CI, Pearson r.
 * Special functions follow Numerical Recipes (Press et al., 2007).
 */
import type { Rng } from './prng';

export const mean = (x: number[]) =>
  x.reduce((a, b) => a + b, 0) / Math.max(1, x.length);

export function variance(x: number[]) {
  if (x.length < 2) return 0;
  const m = mean(x);
  return x.reduce((a, v) => a + (v - m) ** 2, 0) / (x.length - 1);
}

export const sd = (x: number[]) => Math.sqrt(variance(x));

export function quantile(x: number[], q: number) {
  const s = [...x].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** ln Γ(x), Lanczos approximation. */
export function lnGamma(x: number): number {
  const c = [
    76.1800917294715, -86.5053203294168, 24.0140982408309, -1.23173957245015,
    0.120865097386618e-2, -0.5395239384953e-5,
  ];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.00000000019002;
  for (const ci of c) ser += ci / ++y;
  return -tmp + Math.log((Math.sqrt(2 * Math.PI) * ser) / x);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 300;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b). */
export function incBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lnGamma(a + b) -
      lnGamma(a) -
      lnGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (bt * betacf(a, b, x)) / a
    : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Two-sided p-value of Student's t with df degrees of freedom. */
export function tTwoSided(t: number, df: number): number {
  return incBeta(df / (df + t * t), df / 2, 0.5);
}

/** Standard normal CDF (erf via Abramowitz & Stegun 7.1.26, |ε| < 1.5e−7). */
export function normCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export interface WelchResult {
  t: number;
  df: number;
  p: number;
  diff: number;
}

/** Welch's t-test (unequal variances), a − b. */
export function welch(a: number[], b: number[]): WelchResult {
  const va = variance(a) / a.length;
  const vb = variance(b) / b.length;
  const diff = mean(a) - mean(b);
  const se = Math.sqrt(va + vb);
  if (se === 0) return { t: 0, df: a.length + b.length - 2, p: 1, diff };
  const t = diff / se;
  const df =
    (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  return { t, df, p: tTwoSided(t, df), diff };
}

export interface MannWhitneyResult {
  u: number;
  z: number;
  p: number;
  /** Probability of superiority P(A > B) + ½P(A = B). */
  cles: number;
}

/** Mann–Whitney U, normal approximation with tie correction. */
export function mannWhitney(a: number[], b: number[]): MannWhitneyResult {
  const all = [
    ...a.map((v) => ({ v, g: 0 })),
    ...b.map((v) => ({ v, g: 1 })),
  ].sort((x, y) => x.v - y.v);
  const ranks = new Array<number>(all.length);
  let tieSum = 0;
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = r;
    const n = j - i + 1;
    tieSum += n ** 3 - n;
    i = j + 1;
  }
  let r1 = 0;
  all.forEach((x, i) => {
    if (x.g === 0) r1 += ranks[i];
  });
  const n1 = a.length;
  const n2 = b.length;
  const u = r1 - (n1 * (n1 + 1)) / 2;
  const mu = (n1 * n2) / 2;
  const n = n1 + n2;
  const sigma = Math.sqrt(((n1 * n2) / 12) * (n + 1 - tieSum / (n * (n - 1))));
  const z = sigma === 0 ? 0 : (u - mu) / sigma;
  return { u, z, p: 2 * (1 - normCdf(Math.abs(z))), cles: u / (n1 * n2) };
}

/** Cohen's d with pooled SD (a − b). */
export function cohensD(a: number[], b: number[]): number {
  const s = Math.sqrt(
    ((a.length - 1) * variance(a) + (b.length - 1) * variance(b)) /
      (a.length + b.length - 2),
  );
  return s === 0 ? 0 : (mean(a) - mean(b)) / s;
}

/** Percentile bootstrap CI of Cohen's d. */
export function bootstrapD(
  a: number[],
  b: number[],
  rng: Rng,
  reps = 1000,
  level = 0.95,
): [number, number] {
  const ds: number[] = [];
  const draw = (x: number[]) =>
    Array.from({ length: x.length }, () => x[Math.floor(rng() * x.length)]);
  for (let i = 0; i < reps; i++) ds.push(cohensD(draw(a), draw(b)));
  return [quantile(ds, (1 - level) / 2), quantile(ds, 1 - (1 - level) / 2)];
}

export function pearson(x: number[], y: number[]): number {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}

export const rmse = (x: number[], y: number[]) =>
  Math.sqrt(mean(x.map((v, i) => (v - y[i]) ** 2)));

export interface Comparison {
  metric: string;
  nA: number;
  nC: number;
  meanA: number;
  sdA: number;
  meanC: number;
  sdC: number;
  diff: number;
  welchT: number;
  df: number;
  pWelch: number;
  u: number;
  pMW: number;
  cles: number;
  d: number;
  dLo: number;
  dHi: number;
}

/** Full A-vs-C comparison of one metric (A = adaptive, C = control). */
export function compare(
  metric: string,
  a: number[],
  c: number[],
  rng: Rng,
  reps = 1000,
): Comparison {
  const w = welch(a, c);
  const mw = mannWhitney(a, c);
  const [dLo, dHi] = bootstrapD(a, c, rng, reps);
  return {
    metric,
    nA: a.length,
    nC: c.length,
    meanA: mean(a),
    sdA: sd(a),
    meanC: mean(c),
    sdC: sd(c),
    diff: w.diff,
    welchT: w.t,
    df: w.df,
    pWelch: w.p,
    u: mw.u,
    pMW: mw.p,
    cles: mw.cles,
    d: cohensD(a, c),
    dLo,
    dHi,
  };
}
