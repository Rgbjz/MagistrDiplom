import type { AdaptiveRecommendation } from '../../lib/types';
import { clientApi } from '../../lib/api/client';

/** Where a recommendation leads inside the course page. */
export function recommendationHref(r: AdaptiveRecommendation, courseId: number): string {
  const base = `/courses/${courseId}`;
  if (r.assignmentId) return `${base}?assignment=${r.assignmentId}`;
  if (r.testId) return `${base}?test=${r.testId}`;
  if (r.lessonId) return `${base}?lesson=${r.lessonId}`;
  return base;
}

/** Logged for the effectiveness study; never blocks navigation. */
export function logOpened(r: AdaptiveRecommendation, courseId: number) {
  void clientApi(`/adaptive/recommendations/${encodeURIComponent(r.key)}/opened`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courseId }),
  }).catch(() => undefined);
}
