/**
 * Pre-declared v2 candidates (docs/experiment.md, section 10). All share the
 * two fixes the v1 diagnosis points to — evidence gate and soft gating — and
 * differ only in the components the diagnosis left open. They are built from
 * v1 + explicit flags (not from ADAPTIVE_CONFIG_V2), so the selection cannot
 * depend on the value the app ships; a unit test checks that the shipped v2
 * equals the selected candidate.
 */
import {
  ADAPTIVE_CONFIG_V1,
  type AdaptiveConfig,
} from '../../src/modules/adaptive/adaptive.algorithm';

const base = (patch: Partial<AdaptiveConfig>): AdaptiveConfig => ({
  ...ADAPTIVE_CONFIG_V1,
  version: 2,
  evidenceGate: true,
  softGating: true,
  ...patch,
});

export interface Candidate {
  id: string;
  label: string;
  cfg: AdaptiveConfig;
}

export const V2_CANDIDATES: Candidate[] = [
  {
    id: 'C1',
    label: 'EWMA + rotation + spaced review',
    cfg: base({
      masteryModel: 'ewma',
      reviewAllLessons: true,
      spacedReview: true,
    }),
  },
  {
    id: 'C2',
    label: 'topic Elo + rotation + spaced review',
    cfg: base({
      masteryModel: 'elo',
      reviewAllLessons: true,
      spacedReview: true,
    }),
  },
  {
    id: 'C3',
    label: 'topic Elo + rotation',
    cfg: base({
      masteryModel: 'elo',
      reviewAllLessons: true,
      spacedReview: false,
    }),
  },
  {
    id: 'C4',
    label: 'topic Elo + spaced review',
    cfg: base({
      masteryModel: 'elo',
      reviewAllLessons: false,
      spacedReview: true,
    }),
  },
];

/** Selection rule, fixed before looking at held-out seeds. */
export const SELECTION = {
  /** Training seeds: replication indices [0, 10); held-out: [10, 20). */
  trainSeeds: [0, 10] as const,
  heldOutSeeds: [10, 20] as const,
  /** Candidates whose post-test d is within this of the best are «tied». */
  dTolerance: 0.05,
};

export interface CandidateScore {
  id: string;
  d: number;
  rmse: number;
}

/**
 * Highest post-test Cohen's d on the training seeds; among candidates within
 * dTolerance of the best, the lowest system-model RMSE (better calibrated
 * learner model); then the declaration order (simpler first).
 */
export function selectCandidate(scores: CandidateScore[]): string {
  const best = Math.max(...scores.map((s) => s.d));
  const tied = scores.filter((s) => best - s.d <= SELECTION.dTolerance);
  return [...tied].sort((a, b) => a.rmse - b.rmse)[0].id;
}
