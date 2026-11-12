import { useTranslations } from 'next-intl';
import type { GradingScaleKind, ScaleBand } from '../../lib/types';

/** Defaults — mirror backend/src/modules/gradebook/grading-scale.ts. */
export const DEFAULT_BANDS: Record<'FIVE_POINT' | 'ECTS', ScaleBand[]> = {
  FIVE_POINT: [
    { code: '5', min: 90 },
    { code: '4', min: 75 },
    { code: '3', min: 60 },
    { code: '2', min: 0 },
  ],
  ECTS: [
    { code: 'A', min: 90 },
    { code: 'B', min: 82 },
    { code: 'C', min: 74 },
    { code: 'D', min: 64 },
    { code: 'E', min: 60 },
    { code: 'FX', min: 35 },
    { code: 'F', min: 0 },
  ],
};

export const SCALES: GradingScaleKind[] = ['PERCENT', 'FIVE_POINT', 'ECTS', 'PASS_FAIL'];

export function isBanded(scale: GradingScaleKind): scale is 'FIVE_POINT' | 'ECTS' {
  return scale === 'FIVE_POINT' || scale === 'ECTS';
}

/** Band for a final percent (null when there is nothing to grade). */
export function bandFor(final: number | null, bands: ScaleBand[]): ScaleBand | null {
  if (final === null) return null;
  return bands.find((b) => final >= b.min) ?? bands[bands.length - 1] ?? null;
}

const PASSING = new Set(['5', '4', '3', 'A', 'B', 'C', 'D', 'E', 'PASS']);

export function isPassingCode(code: string): boolean {
  return PASSING.has(code);
}

/**
 * Human label for a scale grade code: «5 · відмінно», «A», «Зараховано», «85%».
 * Keys live under gradebook.scale.
 */
export function useScaleLabel() {
  const t = useTranslations('gradebook.scale');
  return (scale: GradingScaleKind | undefined, code: string | undefined | null): string => {
    if (!code) return '—';
    switch (scale) {
      case 'FIVE_POINT':
        return t('fiveLabel', { code, word: t(`five.${code}` as never) });
      case 'ECTS':
        return code;
      case 'PASS_FAIL':
        return code === 'PASS' ? t('pass') : t('fail');
      default:
        return `${code.replace('.', ',')}%`;
    }
  };
}
