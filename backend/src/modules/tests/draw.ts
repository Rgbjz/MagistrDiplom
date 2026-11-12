/**
 * Builds the question list of one attempt. Pure: randomness comes from `rng`
 * so tests can make it deterministic.
 *
 * - The test's own questions, or a random subset of `questionsPerAttempt` of them;
 * - plus, for each bank rule, `count` random questions from the category
 *   (without repeats, skipping questions already drawn);
 * - question order shuffled when `shuffleQuestions`;
 * - choice options shuffled when `shuffleAnswers`; matching right column and
 *   ordering items are always shuffled (their order would give the answer away).
 *
 * The result is stored per attempt in AttemptQuestion (position + optionOrder)
 * so review and grading always show what the student saw.
 */
import { isPlayable, optionKeys, type QuestionLike } from './question-types';

export type Rng = () => number;

export interface DrawSettings {
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  questionsPerAttempt: number | null;
}

export interface DrawnQuestion {
  question: QuestionLike;
  position: number;
  optionOrder: number[] | null;
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Shuffles until the order differs from the original (when that is possible). */
function shuffleAway<T>(items: T[], rng: Rng): T[] {
  if (items.length < 2) return [...items];
  for (let i = 0; i < 5; i++) {
    const s = shuffle(items, rng);
    if (s.some((x, k) => x !== items[k])) return s;
  }
  return [...items.slice(1), items[0]];
}

export function drawAttempt(
  own: QuestionLike[],
  rules: { questions: QuestionLike[]; count: number }[],
  settings: DrawSettings,
  rng: Rng = Math.random,
): DrawnQuestion[] {
  const playableOwn = own.filter(isPlayable);
  const limit = settings.questionsPerAttempt;
  let picked =
    limit && limit > 0 && limit < playableOwn.length
      ? shuffle(playableOwn, rng).slice(0, limit)
      : playableOwn;
  if (!settings.shuffleQuestions) {
    picked = [...picked].sort((a, b) => a.id - b.id);
  }

  const taken = new Set(picked.map((q) => q.id));
  const fromBank: QuestionLike[] = [];
  for (const rule of rules) {
    const pool = rule.questions.filter(
      (q) => isPlayable(q) && !taken.has(q.id),
    );
    for (const q of shuffle(pool, rng).slice(0, Math.max(0, rule.count))) {
      taken.add(q.id);
      fromBank.push(q);
    }
  }

  let all = [...picked, ...fromBank];
  if (settings.shuffleQuestions) all = shuffle(all, rng);

  return all.map((question, position) => {
    const keys = optionKeys(question);
    let optionOrder: number[] | null = null;
    if (question.type === 'MATCHING' || question.type === 'ORDERING') {
      optionOrder = shuffleAway(keys, rng);
    } else if (keys.length) {
      optionOrder = settings.shuffleAnswers ? shuffle(keys, rng) : keys;
    }
    return { question, position, optionOrder };
  });
}
