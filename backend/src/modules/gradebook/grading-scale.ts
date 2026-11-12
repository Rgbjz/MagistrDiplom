/**
 * Grading scales: how a final percent is presented and whether it passes.
 * The backend returns codes only; labels are localized on the frontend.
 */

export type GradingScaleKind = 'PERCENT' | 'FIVE_POINT' | 'ECTS' | 'PASS_FAIL';

export interface ScaleBand {
  code: string;
  /** Lowest percent (inclusive) for this band. */
  min: number;
}

/** Ukrainian 5-point scale: 5 «відмінно» … 2 «незадовільно». */
export const DEFAULT_FIVE_POINT: ScaleBand[] = [
  { code: '5', min: 90 },
  { code: '4', min: 75 },
  { code: '3', min: 60 },
  { code: '2', min: 0 },
];

/** ECTS mapping of the Ukrainian 100-point scale. */
export const DEFAULT_ECTS: ScaleBand[] = [
  { code: 'A', min: 90 },
  { code: 'B', min: 82 },
  { code: 'C', min: 74 },
  { code: 'D', min: 64 },
  { code: 'E', min: 60 },
  { code: 'FX', min: 35 },
  { code: 'F', min: 0 },
];

/** Bands that count as a pass. */
const PASSING: Record<'FIVE_POINT' | 'ECTS', Set<string>> = {
  FIVE_POINT: new Set(['5', '4', '3']),
  ECTS: new Set(['A', 'B', 'C', 'D', 'E']),
};

export function defaultBands(scale: GradingScaleKind): ScaleBand[] | null {
  if (scale === 'FIVE_POINT') return DEFAULT_FIVE_POINT;
  if (scale === 'ECTS') return DEFAULT_ECTS;
  return null;
}

/**
 * Validates custom thresholds for a banded scale. Returns the normalized bands
 * or an error message. Rules: same codes as the default scale, mins are
 * integers 0–100, strictly descending, and the lowest band starts at 0.
 */
export function validateBands(
  scale: GradingScaleKind,
  input: unknown,
): { bands: ScaleBand[] } | { error: string } {
  const defaults = defaultBands(scale);
  if (!defaults) return { error: 'This scale has no thresholds' };
  if (!Array.isArray(input) || input.length !== defaults.length) {
    return { error: `Expected ${defaults.length} bands` };
  }
  const bands: ScaleBand[] = [];
  for (let i = 0; i < defaults.length; i++) {
    const raw = input[i] as { code?: unknown; min?: unknown };
    if (raw?.code !== defaults[i].code) {
      return { error: `Band ${i + 1} must be ${defaults[i].code}` };
    }
    const min = Number(raw.min);
    if (!Number.isInteger(min) || min < 0 || min > 100) {
      return { error: `Band ${defaults[i].code}: threshold must be 0–100` };
    }
    if (i > 0 && min >= bands[i - 1].min) {
      return { error: 'Thresholds must be strictly descending' };
    }
    bands.push({ code: defaults[i].code, min });
  }
  if (bands[bands.length - 1].min !== 0) {
    return { error: 'The lowest band must start at 0' };
  }
  return { bands };
}

/** Effective bands: valid custom config, otherwise the defaults. */
export function bandsFor(
  scale: GradingScaleKind,
  config: unknown,
): ScaleBand[] | null {
  const defaults = defaultBands(scale);
  if (!defaults) return null;
  if (config == null) return defaults;
  const checked = validateBands(scale, config);
  return 'bands' in checked ? checked.bands : defaults;
}

export interface ScaleGrade {
  code: string;
  passed: boolean;
}

/** Maps a final percent to a scale grade; null when there is nothing to grade. */
export function scaleGrade(
  final: number | null,
  scale: GradingScaleKind,
  config: unknown,
  passThreshold: number,
): ScaleGrade | null {
  if (final === null) return null;
  if (scale === 'PERCENT') {
    return { code: `${final}`, passed: final >= passThreshold };
  }
  if (scale === 'PASS_FAIL') {
    const passed = final >= passThreshold;
    return { code: passed ? 'PASS' : 'FAIL', passed };
  }
  const bands = bandsFor(scale, config) as ScaleBand[];
  const band = bands.find((b) => final >= b.min) ?? bands[bands.length - 1];
  return { code: band.code, passed: PASSING[scale].has(band.code) };
}
