'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { clientApi } from '../../../lib/api/client';
import type { Gradebook, GradingScaleKind, ScaleBand } from '../../../lib/types';
import { Field, Input, Select } from '../../ui';
import {
  DEFAULT_BANDS,
  SCALES,
  bandFor,
  isBanded,
  useScaleLabel,
} from '../../gradebook/scale';
import styles from './CourseFields.module.scss';

export interface GradingState {
  testsWeight: string;
  assignmentsWeight: string;
  gradePassThreshold: string;
  gradingScale: GradingScaleKind;
  /** Lower boundaries as typed (only for banded scales). */
  bands: { code: string; min: string }[];
}

function bandsState(scale: GradingScaleKind, config?: ScaleBand[] | null) {
  if (!isBanded(scale)) return [];
  const source = config && config.length === DEFAULT_BANDS[scale].length ? config : DEFAULT_BANDS[scale];
  return source.map((b) => ({ code: b.code, min: String(b.min) }));
}

export function gradingFromCourse(course: {
  testsWeight?: number;
  assignmentsWeight?: number;
  gradePassThreshold?: number;
  gradingScale?: GradingScaleKind;
  gradingScaleConfig?: ScaleBand[] | null;
}): GradingState {
  const scale = course.gradingScale ?? 'PERCENT';
  return {
    testsWeight: String(course.testsWeight ?? 50),
    assignmentsWeight: String(course.assignmentsWeight ?? 50),
    gradePassThreshold: String(course.gradePassThreshold ?? 60),
    gradingScale: scale,
    bands: bandsState(scale, course.gradingScaleConfig),
  };
}

/** Fields for the course PATCH (multipart strings). */
export function gradingPayload(g: GradingState): Record<string, string> {
  return {
    testsWeight: g.testsWeight,
    assignmentsWeight: g.assignmentsWeight,
    gradePassThreshold: g.gradePassThreshold,
    gradingScale: g.gradingScale,
    gradingScaleConfig: isBanded(g.gradingScale)
      ? JSON.stringify(g.bands.map((b) => ({ code: b.code, min: Number(b.min) })))
      : '',
  };
}

function bandsValid(bands: GradingState['bands']): boolean {
  if (!bands.length) return true;
  const mins = bands.map((b) => b.min);
  if (!mins.every((m) => /^\d+$/.test(m) && Number(m) <= 100)) return false;
  for (let i = 1; i < mins.length; i++) {
    if (Number(mins[i]) >= Number(mins[i - 1])) return false;
  }
  return Number(mins[mins.length - 1]) === 0;
}

const inRange = (v: string) => /^\d+$/.test(v) && Number(v) >= 0 && Number(v) <= 100;

/** Translation key (under teacher.courseForm.validation) or null when valid. */
export type GradingError = 'gradingRange' | 'gradingSum' | 'gradingBands';

export function validateGrading(g: GradingState): GradingError | null {
  if (![g.testsWeight, g.assignmentsWeight, g.gradePassThreshold].every(inRange)) {
    return 'gradingRange';
  }
  if (Number(g.testsWeight) + Number(g.assignmentsWeight) !== 100) {
    return 'gradingSum';
  }
  if (isBanded(g.gradingScale) && !bandsValid(g.bands)) return 'gradingBands';
  return null;
}

export function GradingFields({
  value,
  onChange,
  error,
  courseId,
}: {
  value: GradingState;
  onChange: Dispatch<SetStateAction<GradingState>>;
  error?: GradingError | null;
  /** Existing course: enables the live preview of how students map. */
  courseId?: number;
}) {
  const t = useTranslations('teacher');
  const scaleLabel = useScaleLabel();
  const { data: book } = useQuery({
    queryKey: ['gradebook', courseId],
    queryFn: () => clientApi<Gradebook>(`/courses/${courseId}/gradebook`),
    enabled: !!courseId,
  });
  const finals = (book?.rows ?? []).map((r) => r.final).filter((f): f is number => f !== null);
  const bands: ScaleBand[] = value.bands.map((b) => ({ code: b.code, min: Number(b.min) }));
  const preview = (() => {
    if (!finals.length) return null;
    if (isBanded(value.gradingScale) && bandsValid(value.bands)) {
      return bands.map((b) => ({
        code: b.code,
        count: finals.filter((f) => bandFor(f, bands)?.code === b.code).length,
      }));
    }
    if (value.gradingScale === 'PASS_FAIL' && inRange(value.gradePassThreshold)) {
      const th = Number(value.gradePassThreshold);
      return [
        { code: 'PASS', count: finals.filter((f) => f >= th).length },
        { code: 'FAIL', count: finals.filter((f) => f < th).length },
      ];
    }
    return null;
  })();

  return (
    <div className={styles.fields}>
      <Field label={t('grading.scale')} hint={t('grading.scaleHint')}>
        <Select
          value={value.gradingScale}
          onChange={(e) => {
            const scale = e.target.value as GradingScaleKind;
            onChange((g) => ({ ...g, gradingScale: scale, bands: bandsState(scale) }));
          }}
        >
          {SCALES.map((s) => (
            <option key={s} value={s}>
              {t(`grading.scales.${s}`)}
            </option>
          ))}
        </Select>
      </Field>
      {isBanded(value.gradingScale) && (
        <fieldset className={styles.bands}>
          <legend className={styles.bandsLegend}>{t('grading.bands')}</legend>
          <p className={styles.note}>{t('grading.bandsHint')}</p>
          <div className={styles.bandsGrid}>
            {value.bands.map((b, i) => (
              <label key={b.code} className={styles.band}>
                <span className={styles.bandCode}>{scaleLabel(value.gradingScale, b.code)}</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  inputMode="numeric"
                  value={b.min}
                  aria-label={`${scaleLabel(value.gradingScale, b.code)}: ${t('grading.bandMin')}`}
                  disabled={i === value.bands.length - 1}
                  onChange={(e) => {
                    const v = e.target.value;
                    onChange((g) => ({
                      ...g,
                      bands: g.bands.map((x, j) => (j === i ? { ...x, min: v } : x)),
                    }));
                  }}
                />
                <span className={styles.note}>{t('grading.bandMin')}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => onChange((g) => ({ ...g, bands: bandsState(g.gradingScale) }))}
          >
            {t('grading.bandsReset')}
          </button>
        </fieldset>
      )}
      {value.gradingScale === 'PASS_FAIL' && <p className={styles.note}>{t('grading.passFailHint')}</p>}
      {courseId && (isBanded(value.gradingScale) || value.gradingScale === 'PASS_FAIL') && (
        <div className={styles.preview} aria-live="polite">
          <span className={styles.previewTitle}>{t('grading.preview')}</span>
          {preview ? (
            <ul className={styles.previewList}>
              {preview.map((p) => (
                <li key={p.code}>
                  <strong>{scaleLabel(value.gradingScale, p.code)}</strong>: {t('grading.previewCount', { count: p.count })}
                </li>
              ))}
            </ul>
          ) : (
            <span className={styles.note}>{t('grading.previewEmpty')}</span>
          )}
        </div>
      )}
      <div className={styles.row}>
        <Field label={t('grading.testsWeight')}>
          <Input
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            value={value.testsWeight}
            onChange={(e) => {
              const v = e.target.value;
              // Keep the pair summing to 100 when the other weight is untouched.
              onChange((g) => ({
                ...g,
                testsWeight: v,
                assignmentsWeight: inRange(v) ? String(100 - Number(v)) : g.assignmentsWeight,
              }));
            }}
            aria-invalid={!!error}
          />
        </Field>
        <Field label={t('grading.assignmentsWeight')}>
          <Input
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            value={value.assignmentsWeight}
            onChange={(e) => {
              const v = e.target.value;
              onChange((g) => ({
                ...g,
                assignmentsWeight: v,
                testsWeight: inRange(v) ? String(100 - Number(v)) : g.testsWeight,
              }));
            }}
            aria-invalid={!!error}
          />
        </Field>
        <Field label={t('grading.threshold')} hint={t('grading.thresholdHint')}>
          <Input
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            value={value.gradePassThreshold}
            onChange={(e) => onChange((g) => ({ ...g, gradePassThreshold: e.target.value }))}
          />
        </Field>
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {t(`courseForm.validation.${error}`)}
        </p>
      ) : (
        <p className={styles.note}>{t('grading.formula')}</p>
      )}
    </div>
  );
}
