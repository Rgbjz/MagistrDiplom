/**
 * Simulation model (імітаційна модель): a synthetic course and a simulated
 * learner whose TRUE knowledge is independent of the system's learner model.
 * The system only sees observable outcomes (answers, completed lessons).
 */
import { beta, bernoulli, normal, type Rng } from './prng';

export type LearnerType = 'weak' | 'average' | 'strong';

/** All simulation parameters in one place (documented in docs/experiment.md). */
export const SIM_CONFIG = {
  course: {
    topics: 5,
    lessonsPerTopic: 3,
    /** Practice pool per topic: 4 questions of each level 1..3. */
    questionsPerLevel: 4,
    /** Held-out post-test questions per topic (never used during the course). */
    postTestPerTopic: 4,
    /** Questions in one topic test (fixed or adaptive). */
    testSize: 6,
    /** Pass mark of a topic test (as in the LMS, 60 %). */
    passingScore: 0.6,
  },
  /** True difficulty b = logit(level) + N(0, σ_b): levels −1/0/+1 as in the LMS. */
  difficulty: {
    byLevel: { 1: -1, 2: 0, 3: 1 } as Record<number, number>,
    noise: 0.4,
  },
  /** Population: share, prior knowledge Beta(a, b), base learning rate g. */
  population: {
    weak: { share: 0.3, prior: [2, 8] as [number, number], gain: 0.12 },
    average: { share: 0.4, prior: [3, 5] as [number, number], gain: 0.18 },
    strong: { share: 0.3, prior: [6, 4] as [number, number], gain: 0.24 },
  } as Record<
    LearnerType,
    { share: number; prior: [number, number]; gain: number }
  >,
  /** Individual learning-rate spread: g · exp(N(0, σ)). */
  gainSpread: 0.2,
  /** Gain of the n-th repeated study of the same lesson: × repetition^n. */
  repetition: 0.6,
  /** Prerequisites: gain on topic t × (p0 + (1 − p0)·k_{t−1}). */
  prerequisiteFloor: 0.6,
  /** Testing effect: each answered question with feedback adds tg·(1 − k). */
  testingGain: 0.01,
  /** Forgetting of the learned part: (k − k₀) · e^{−φ·Δt}, Δt in minutes. */
  forgettingPerMinute: 1 / 1500,
  /** Answer model (BKT-style guess/slip + logistic link). */
  answer: { guess: 0.2, slip: 0.08, slope: 1.0, scale: 4 },
  /** Time cost, minutes. */
  time: { lesson: 12, question: 1.5 },
  /** Study-time budget per learner, minutes. */
  budget: 360,
  /** True mastery of a topic. */
  masteredAt: 0.8,
};

export type SimConfig = typeof SIM_CONFIG;

// ───────────────────────────── course ─────────────────────────────

export interface SimQuestion {
  id: number;
  topic: number;
  level: 1 | 2 | 3;
  /** True difficulty (logits) — unknown to the system. */
  b: number;
}

export interface SimLesson {
  id: number;
  topic: number;
  /** Position inside the topic, 0-based. */
  index: number;
  /** The last lesson of a topic carries the topic test (as in the seed). */
  hasTest: boolean;
}

export interface SimCourse {
  lessons: SimLesson[];
  /** Practice pool per topic. */
  pool: SimQuestion[][];
  /** Held-out post-test, per topic. */
  postTest: SimQuestion[][];
}

export function makeCourse(rng: Rng, cfg: SimConfig = SIM_CONFIG): SimCourse {
  const c = cfg.course;
  const lessons: SimLesson[] = [];
  const pool: SimQuestion[][] = [];
  const postTest: SimQuestion[][] = [];
  let qid = 1;
  const question = (topic: number, level: 1 | 2 | 3): SimQuestion => ({
    id: qid++,
    topic,
    level,
    b: cfg.difficulty.byLevel[level] + normal(rng, 0, cfg.difficulty.noise),
  });
  for (let t = 0; t < c.topics; t++) {
    for (let i = 0; i < c.lessonsPerTopic; i++) {
      lessons.push({
        id: t * c.lessonsPerTopic + i + 1,
        topic: t,
        index: i,
        hasTest: i === c.lessonsPerTopic - 1,
      });
    }
    const qs: SimQuestion[] = [];
    for (const level of [1, 2, 3] as const) {
      for (let k = 0; k < c.questionsPerLevel; k++) qs.push(question(t, level));
    }
    pool.push(qs);
    const held: SimQuestion[] = [];
    for (let k = 0; k < c.postTestPerTopic; k++) {
      held.push(question(t, ((k % 3) + 1) as 1 | 2 | 3));
    }
    postTest.push(held);
  }
  return { lessons, pool, postTest };
}

// ───────────────────────────── learner ─────────────────────────────

export interface SimLearner {
  type: LearnerType;
  /** Learning rate g. */
  gain: number;
  /** Prior (baseline) knowledge per topic, k₀. */
  base: number[];
  /** Current true knowledge per topic. */
  k: number[];
  /** Minute of the last practice of each topic (for forgetting). */
  lastPractice: number[];
  /** How many times each lesson was studied. */
  studied: Map<number, number>;
  /** Simulated clock, minutes. */
  clock: number;
}

export function pickType(rng: Rng, cfg: SimConfig = SIM_CONFIG): LearnerType {
  const u = rng();
  const p = cfg.population;
  if (u < p.weak.share) return 'weak';
  if (u < p.weak.share + p.average.share) return 'average';
  return 'strong';
}

export function makeLearner(
  rng: Rng,
  topics: number,
  type: LearnerType = pickType(rng),
  cfg: SimConfig = SIM_CONFIG,
): SimLearner {
  const p = cfg.population[type];
  const base = Array.from({ length: topics }, () => beta(rng, ...p.prior));
  return {
    type,
    gain: p.gain * Math.exp(normal(rng, 0, cfg.gainSpread)),
    base,
    k: [...base],
    lastPractice: Array(topics).fill(0) as number[],
    studied: new Map(),
    clock: 0,
  };
}

/** Deep copy (the same virtual learner under two policies, for unit tests). */
export function cloneLearner(l: SimLearner): SimLearner {
  return {
    ...l,
    base: [...l.base],
    k: [...l.k],
    lastPractice: [...l.lastPractice],
    studied: new Map(l.studied),
  };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** True ability on the logit scale: θ = scale·(k − 0.5). */
export function trueTheta(k: number, cfg: SimConfig = SIM_CONFIG): number {
  return cfg.answer.scale * (k - 0.5);
}

/** P(correct) = guess + (1 − guess − slip) · σ(a · (θ(k) − b)). */
export function pAnswer(
  k: number,
  b: number,
  cfg: SimConfig = SIM_CONFIG,
): number {
  const a = cfg.answer;
  return (
    a.guess +
    (1 - a.guess - a.slip) * sigmoid(a.slope * (trueTheta(k, cfg) - b))
  );
}

/** Advances the simulated clock. */
export function spendTime(l: SimLearner, minutes: number) {
  l.clock += minutes;
}

function forget(l: SimLearner, topic: number, cfg: SimConfig) {
  const dt = l.clock - l.lastPractice[topic];
  if (dt > 0 && cfg.forgettingPerMinute > 0) {
    const learned = l.k[topic] - l.base[topic];
    if (learned > 0)
      l.k[topic] =
        l.base[topic] + learned * Math.exp(-cfg.forgettingPerMinute * dt);
  }
  l.lastPractice[topic] = l.clock;
}

/** Applies forgetting to every topic up to the current clock (for measurement). */
export function settle(l: SimLearner, cfg: SimConfig = SIM_CONFIG) {
  for (let t = 0; t < l.k.length; t++) forget(l, t, cfg);
}

/** Studying a lesson: k ← k + g·rep^n·prereq·(1 − k). Returns true gain. */
export function studyLesson(
  l: SimLearner,
  lesson: SimLesson,
  cfg: SimConfig = SIM_CONFIG,
): number {
  forget(l, lesson.topic, cfg);
  const n = l.studied.get(lesson.id) ?? 0;
  const prereq =
    lesson.topic === 0
      ? 1
      : cfg.prerequisiteFloor +
        (1 - cfg.prerequisiteFloor) * l.k[lesson.topic - 1];
  const before = l.k[lesson.topic];
  const g = Math.min(1, l.gain * cfg.repetition ** n * prereq);
  l.k[lesson.topic] = before + g * (1 - before);
  l.studied.set(lesson.id, n + 1);
  spendTime(l, cfg.time.lesson);
  return l.k[lesson.topic] - before;
}

/** Answers one question: sampled correctness, testing effect, time. */
export function answer(
  l: SimLearner,
  q: SimQuestion,
  rng: Rng,
  cfg: SimConfig = SIM_CONFIG,
): 0 | 1 {
  forget(l, q.topic, cfg);
  const r = bernoulli(rng, pAnswer(l.k[q.topic], q.b, cfg));
  l.k[q.topic] += cfg.testingGain * (1 - l.k[q.topic]);
  spendTime(l, cfg.time.question);
  return r;
}

/** Common post-test: sampled score and its expectation (no learning, no time). */
export function postTest(
  l: SimLearner,
  course: SimCourse,
  rng: Rng,
  cfg: SimConfig = SIM_CONFIG,
): { score: number; expected: number } {
  settle(l, cfg);
  const qs = course.postTest.flat();
  let hits = 0;
  let exp = 0;
  for (const q of qs) {
    const p = pAnswer(l.k[q.topic], q.b, cfg);
    exp += p;
    hits += bernoulli(rng, p);
  }
  return { score: hits / qs.length, expected: exp / qs.length };
}
