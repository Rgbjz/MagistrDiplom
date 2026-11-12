import type { Question } from './types';

/** Mirrors the backend rule (tests/question-types.ts › questionProblem). */
export type QuestionProblem =
  | 'noText'
  | 'fewOptions'
  | 'noCorrect'
  | 'noAccepted'
  | 'noValue'
  | 'fewPairs'
  | 'fewItems';

export const QUESTION_PROBLEMS: QuestionProblem[] = [
  'noText',
  'fewOptions',
  'noCorrect',
  'noAccepted',
  'noValue',
  'fewPairs',
  'fewItems',
];

/** Why students can't answer this question yet, or null when it's complete. */
export function questionProblem(q: Question): QuestionProblem | null {
  if (!q.text?.trim()) return 'noText';
  const c = q.config ?? {};
  switch (q.type) {
    case 'SINGLE':
    case 'MULTIPLE':
      if (q.answers.filter((a) => a.text?.trim()).length < 2) return 'fewOptions';
      return q.answers.some((a) => a.isCorrect) ? null : 'noCorrect';
    case 'SHORT_TEXT':
      return (c.accepted ?? []).length > 0 ? null : 'noAccepted';
    case 'NUMERIC':
      return Number.isFinite(Number(c.value)) ? null : 'noValue';
    case 'MATCHING':
      return (c.pairs ?? []).filter((p) => p.left && p.right).length >= 2 ? null : 'fewPairs';
    case 'ORDERING':
      return (c.items ?? []).filter(Boolean).length >= 2 ? null : 'fewItems';
    default:
      return null;
  }
}
