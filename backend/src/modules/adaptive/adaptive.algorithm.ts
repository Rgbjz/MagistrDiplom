/**
 * Adaptation module — pure algorithms (no Nest/Prisma), reused by the
 * service and by the simulation study.
 *
 * 1. Learner model
 *    - Topic mastery m ∈ [0,1] per course section, updated by an
 *      exponentially weighted moving average of normalised evidence:
 *          m ← m + α · w · (s − m)
 *      s ∈ [0,1] — score of one piece of evidence, w — its weight
 *      (test answer > assignment grade > lesson completion), α — learning
 *      rate. Prior m₀ = 0.5 with zero evidence.
 *    - Ability θ per course and difficulty b per question on one logit scale
 *      (Rasch model), calibrated online by Elo updates:
 *          P = σ(θ − b) = 1 / (1 + e^{−(θ − b)})
 *          θ ← θ + K_θ(n) · (r − P),   b ← b − K_b(k) · (r − P)
 *      with decaying step sizes K(n) = K₀ / (1 + λ·n) (more answers → more
 *      certain estimate).
 * 2. Personalisation: deterministic, explainable recommendation scoring.
 * 3. Adaptive test assembly: questions whose b is closest to
 *      b* = θ − ln(p* / (1 − p*)),  p* = 0.7
 *    i.e. the student answers correctly with probability ≈ 70 %.
 * 4. A/B experiment: balanced random assignment and the gating rule.
 *
 * Version 2 fixes the flaws found by the
 * simulation study of v1 (docs/experiment.md), v1 stays reproducible as
 * ADAPTIVE_CONFIG_V1:
 *  a) evidence gate — only assessed evidence (test answers, graded work)
 *     counts towards the level; a completed lesson moves m but a topic is
 *     never «weak» before the student was assessed on it;
 *  b) soft gating — once all lessons of a weak topic are completed and its
 *     test was attempted, the topic no longer blocks NEXT and its REVIEW /
 *     RETRY suggestions move behind the next lesson («finish, then revisit»);
 *  c) mastery from per-topic ability (optional, masteryModel = 'elo'):
 *         θ_t = logit(m),  θ_t ← θ_t + K_t(n)·(r − σ(θ_t − b)),  m = σ(θ_t)
 *     i.e. m is the probability of answering a reference (medium, b = 0)
 *     item, so «70 % at your own level» is no longer read as m = 0.7.
 *
 * Version 3 (ADAPTIVE_CONFIG, used by the app) = v2 + retrieval practice:
 * a studied weak topic is retested before its lessons are re-read.
 */

// ───────────────────────────── configuration ─────────────────────────────

export interface AdaptiveConfig {
  /** 1 — first version; 2, 3 — revisions after the simulation studies. */
  version: 1 | 2 | 3;
  /** Topic mastery: EWMA of scores (v1) or σ of a per-topic Elo ability. */
  masteryModel: 'ewma' | 'elo';
  /** Only assessed evidence (answers, graded work) counts towards the level. */
  evidenceGate: boolean;
  /** A studied-and-tested weak topic stops blocking NEXT (review later). */
  softGating: boolean;
  /** REVIEW offers every lesson of a weak topic (v1: only the top two). */
  reviewAllLessons: boolean;
  /** After the whole course is completed, keep reviewing the weakest topic. */
  spacedReview: boolean;
  /** v3: placement quiz — questions per topic at course start (0 = off). */
  placementQuestions: number;
  /** v3: NEXT skips lessons of topics already at the «mastered» level. */
  skipMasteredInNext: boolean;
  /** v3: a studied weak topic is practised by retesting before re-reading. */
  retrievalPractice: boolean;
  /** v3: after the course, review every topic by predicted forgetting × gap. */
  spacedAll: boolean;
  /** v3: forgetting horizon H of the spaced-review gap 1 − m·e^{−Δt/H}, ms. */
  forgetHorizonMs: number;
  priorMastery: number;
  alpha: number;
  weights: { question: number; assignment: number; lesson: number };
  lessonCompletionScore: number;
  difficultyWeight: Record<number, number>;
  difficultyLogit: Record<number, number>;
  elo: {
    kTheta: number;
    kB: number;
    decay: number;
    thetaClamp: number;
    bClamp: number;
    /** Step of the per-topic ability (masteryModel = 'elo'). */
    kTopic: number;
    /** Expected learning from a first completed lesson, logits. */
    lessonNudge: number;
  };
  targetP: number;
  masteryThreshold: number;
  accelerationThreshold: number;
  minEvidence: number;
  topN: number;
  deadlineHorizonDays: number;
  priority: {
    review: number;
    retry: number;
    next: number;
    skip: number;
    challenge: number;
    deadline: number;
    gap: number;
    wrongShare: number;
    deadlineBoost: number;
    sequence: number;
    /** Soft gating: REVIEW/RETRY of an engaged weak topic drop below NEXT. */
    demote: number;
    /** Spaced review after the course is completed (lowest priority). */
    spaced: number;
  };
}

/** Version 1 — kept unchanged for the simulation study and the thesis. */
export const ADAPTIVE_CONFIG_V1: AdaptiveConfig = {
  version: 1,
  masteryModel: 'ewma',
  evidenceGate: false,
  softGating: false,
  reviewAllLessons: false,
  spacedReview: false,
  placementQuestions: 0,
  skipMasteredInNext: false,
  retrievalPractice: false,
  spacedAll: false,
  forgetHorizonMs: 86_400_000,
  /** Prior mastery of a topic without evidence. */
  priorMastery: 0.5,
  /** EWMA learning rate α. */
  alpha: 0.3,
  /** Evidence weights w: how strongly each kind of evidence moves m. */
  weights: { question: 1, assignment: 0.8, lesson: 0.25 },
  /** Score s of a completed lesson (engagement, not proof of knowledge). */
  lessonCompletionScore: 0.7,
  /** Extra weight of a question answer by its difficulty level 1..3. */
  difficultyWeight: { 1: 0.8, 2: 1, 3: 1.2 },
  /** Initial difficulty b of a question by its level 1..3 (logits). */
  difficultyLogit: { 1: -1, 2: 0, 3: 1 },
  /** Elo step sizes and their decay: K(n) = K₀ / (1 + λ·n). */
  elo: {
    kTheta: 0.6,
    kB: 0.3,
    decay: 0.05,
    thetaClamp: 4,
    bClamp: 4,
    kTopic: 0.6,
    lessonNudge: 0.15,
  },
  /** Target probability of a correct answer in an adaptive test. */
  targetP: 0.7,
  /** Default thresholds (overridden per course). */
  masteryThreshold: 0.6,
  accelerationThreshold: 0.85,
  /** Evidence needed before a topic counts as mastered. */
  minEvidence: 3,
  /** How many recommendations are returned. */
  topN: 5,
  /** Deadlines closer than this (days) raise priority. */
  deadlineHorizonDays: 7,
  /** Weights of the recommendation priority formula. */
  priority: {
    review: 1.0,
    retry: 0.9,
    next: 0.8,
    skip: 0.6,
    challenge: 0.4,
    deadline: 1.1,
    gap: 2.0,
    wrongShare: 0.3,
    deadlineBoost: 0.6,
    sequence: 0.2,
    demote: 1.5,
    spaced: 0.3,
  },
};

/**
 * Version 2 — used by the app. Candidate C4 of the pre-declared set, chosen
 * on training seeds of the simulation (docs/experiment.md, section 10).
 */
export const ADAPTIVE_CONFIG_V2: AdaptiveConfig = {
  ...ADAPTIVE_CONFIG_V1,
  version: 2,
  masteryModel: 'elo',
  evidenceGate: true,
  softGating: true,
  reviewAllLessons: false,
  spacedReview: true,
};

/**
 * Version 3 — v2 + retrieval practice: once every lesson of a weak topic was
 * studied, a short retest is suggested before re-reading. Candidate V3-B of
 * the pre-registered study (docs/experiment/v3-preregistration.md), chosen on
 * training seeds and better than v2 on fresh seeds (docs/experiment.md, 11).
 */
export const ADAPTIVE_CONFIG_V3: AdaptiveConfig = {
  ...ADAPTIVE_CONFIG_V2,
  version: 3,
  retrievalPractice: true,
};

/** The configuration the LMS runs. */
export const ADAPTIVE_CONFIG: AdaptiveConfig = ADAPTIVE_CONFIG_V3;

export interface Thresholds {
  masteryThreshold: number;
  accelerationThreshold: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

// ───────────────────────────── learner model ─────────────────────────────

export interface MasteryState {
  mastery: number;
  evidence: number;
}

export type EvidenceKind = 'question' | 'assignment' | 'lesson';

export interface Evidence {
  kind: EvidenceKind;
  /** Normalised score s ∈ [0,1]. */
  score: number;
  /** Question difficulty level 1..3 (questions only). */
  difficulty?: number;
  /** Calibrated difficulty b (questions only, masteryModel = 'elo'); falls back to the level. */
  b?: number;
}

export function priorMastery(
  cfg: AdaptiveConfig = ADAPTIVE_CONFIG,
): MasteryState {
  return { mastery: cfg.priorMastery, evidence: 0 };
}

/** Effective weight w of one piece of evidence. */
export function evidenceWeight(
  e: Evidence,
  cfg: AdaptiveConfig = ADAPTIVE_CONFIG,
): number {
  const base = cfg.weights[e.kind];
  if (e.kind !== 'question') return base;
  return base * (cfg.difficultyWeight[e.difficulty ?? 1] ?? 1);
}

const logit = (p: number) => {
  const q = clamp(p, 1e-4, 1 - 1e-4);
  return Math.log(q / (1 - q));
};

/**
 * One piece of evidence.
 * - masteryModel 'ewma': m ← m + α · w · (s − m), clamped to [0,1].
 * - masteryModel 'elo': θ_t = logit(m); an answer (or graded work, as an
 *   item of reference difficulty b = 0) moves θ_t ← θ_t + K_t(n)·w·(s − σ(θ_t − b))
 *   with K_t(n) = K_topic / (1 + λ·n); a completed lesson adds the expected
 *   learning gain θ_t += nudge; m = σ(θ_t).
 * - evidenceGate: lesson completions do not count as evidence (n), so a
 *   topic stays «unknown» until the student was assessed on it.
 */
export function updateMastery(
  state: MasteryState,
  e: Evidence,
  cfg: AdaptiveConfig = ADAPTIVE_CONFIG,
): MasteryState {
  const s = clamp01(e.score);
  const counts = !(cfg.evidenceGate && e.kind === 'lesson');
  const evidence = state.evidence + (counts ? 1 : 0);
  if (cfg.masteryModel === 'elo') {
    let theta = logit(state.mastery);
    if (e.kind === 'lesson') {
      theta += cfg.elo.lessonNudge;
    } else {
      const b =
        e.kind === 'question'
          ? (e.b ?? initialDifficulty(e.difficulty ?? 2, cfg))
          : 0;
      const k = cfg.elo.kTopic / (1 + cfg.elo.decay * state.evidence);
      const w = e.kind === 'question' ? 1 : cfg.weights.assignment;
      theta += k * w * (s - sigmoid(theta - b));
    }
    theta = clamp(theta, -cfg.elo.thetaClamp, cfg.elo.thetaClamp);
    return { mastery: sigmoid(theta), evidence };
  }
  const step = clamp01(cfg.alpha * evidenceWeight(e, cfg));
  return {
    mastery: clamp01(state.mastery + step * (s - state.mastery)),
    evidence,
  };
}

export type MasteryLevel = 'unknown' | 'weak' | 'progress' | 'mastered';

export function masteryLevel(
  state: MasteryState,
  t: Thresholds,
  cfg: AdaptiveConfig = ADAPTIVE_CONFIG,
): MasteryLevel {
  if (state.evidence === 0) return 'unknown';
  if (state.mastery < t.masteryThreshold) return 'weak';
  if (
    state.mastery >= t.accelerationThreshold &&
    state.evidence >= cfg.minEvidence
  )
    return 'mastered';
  return 'progress';
}

// ───────────────────────────── Rasch / Elo ─────────────────────────────

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** P(correct) of a student with ability θ on a question of difficulty b. */
export function pCorrect(theta: number, b: number) {
  return sigmoid(theta - b);
}

export function initialDifficulty(
  level: number,
  cfg: AdaptiveConfig = ADAPTIVE_CONFIG,
): number {
  return cfg.difficultyLogit[clamp(Math.round(level), 1, 3)];
}

export interface EloState {
  theta: number;
  answers: number;
}

export interface QuestionCalibration {
  b: number;
  count: number;
}

/**
 * One Elo step after a graded answer r ∈ [0,1] (partial credit allowed):
 * θ ← θ + K_θ(n)·(r − P),  b ← b − K_b(k)·(r − P).
 */
export function eloUpdate(
  student: EloState,
  question: QuestionCalibration,
  r: number,
  cfg: AdaptiveConfig = ADAPTIVE_CONFIG,
): { student: EloState; question: QuestionCalibration; p: number } {
  const p = pCorrect(student.theta, question.b);
  const diff = clamp01(r) - p;
  const kT = cfg.elo.kTheta / (1 + cfg.elo.decay * student.answers);
  const kB = cfg.elo.kB / (1 + cfg.elo.decay * question.count);
  return {
    p,
    student: {
      theta: clamp(
        student.theta + kT * diff,
        -cfg.elo.thetaClamp,
        cfg.elo.thetaClamp,
      ),
      answers: student.answers + 1,
    },
    question: {
      b: clamp(question.b - kB * diff, -cfg.elo.bClamp, cfg.elo.bClamp),
      count: question.count + 1,
    },
  };
}

/** b* = θ − ln(p* / (1 − p*)): difficulty answered correctly with p*. */
export function targetDifficulty(
  theta: number,
  targetP: number = ADAPTIVE_CONFIG.targetP,
): number {
  const p = clamp(targetP, 0.05, 0.95);
  return theta - Math.log(p / (1 - p));
}

// ───────────────────────────── replay ─────────────────────────────

/** One time-ordered piece of evidence from the course history. */
export interface HistoryEvent {
  at: number;
  userId: number;
  sectionId: number;
  kind: EvidenceKind;
  score: number;
  /** Question answers only. */
  questionId?: number;
  difficulty?: number;
}

export interface ReplayResult {
  mastery: Map<string, MasteryState>;
  ability: Map<number, EloState>;
  calibration: Map<number, QuestionCalibration>;
}

export const masteryKey = (userId: number, sectionId: number) =>
  `${userId}:${sectionId}`;

/**
 * Rebuilds the learner model from history in chronological order — the same
 * steps as the online updates, so recompute == incremental updates.
 */
export function replayHistory(
  events: HistoryEvent[],
  cfg: AdaptiveConfig = ADAPTIVE_CONFIG,
): ReplayResult {
  const mastery = new Map<string, MasteryState>();
  const ability = new Map<number, EloState>();
  const calibration = new Map<number, QuestionCalibration>();
  const sorted = [...events].sort((a, b) => a.at - b.at);
  for (const e of sorted) {
    const key = masteryKey(e.userId, e.sectionId);
    mastery.set(
      key,
      updateMastery(mastery.get(key) ?? priorMastery(cfg), e, cfg),
    );
    if (e.kind === 'question' && e.questionId !== undefined) {
      const st = ability.get(e.userId) ?? { theta: 0, answers: 0 };
      const q = calibration.get(e.questionId) ?? {
        b: initialDifficulty(e.difficulty ?? 1, cfg),
        count: 0,
      };
      const next = eloUpdate(st, q, e.score, cfg);
      ability.set(e.userId, next.student);
      calibration.set(e.questionId, next.question);
    }
  }
  return { mastery, ability, calibration };
}

// ───────────────────────────── adaptive test ─────────────────────────────

export interface PoolQuestion {
  id: number;
  /** Calibrated difficulty (logits). */
  b: number;
  sectionId: number;
}

export interface AssemblyInput {
  pool: PoolQuestion[];
  count: number;
  theta: number;
  weakSectionIds?: number[];
  /** Questions of the student's previous attempt (avoid exact repeats). */
  lastAttemptIds?: number[];
  targetP?: number;
  rng?: () => number;
}

export interface AssemblyResult {
  ids: number[];
  target: number;
}

/**
 * Picks `count` questions closest to the target difficulty b*.
 * cost(q) = |b_q − b*| + 1.0·[q in last attempt] − 0.5·[q in weak topic] + ε
 * Weak topics are covered first (the best question of each weak section),
 * then the cheapest remaining questions fill the attempt; an attempt never
 * repeats the previous one exactly when the pool has other questions.
 */
export function assembleAdaptiveTest(input: AssemblyInput): AssemblyResult {
  const rng = input.rng ?? Math.random;
  const target = targetDifficulty(input.theta, input.targetP);
  const weak = new Set(input.weakSectionIds ?? []);
  const last = new Set(input.lastAttemptIds ?? []);
  const count = Math.max(0, Math.min(input.count, input.pool.length));
  const cost = new Map(
    input.pool.map((q) => [
      q.id,
      Math.abs(q.b - target) +
        (last.has(q.id) ? 1 : 0) -
        (weak.has(q.sectionId) ? 0.5 : 0) +
        rng() * 0.01,
    ]),
  );
  const byCost = [...input.pool].sort(
    (a, b) => cost.get(a.id)! - cost.get(b.id)!,
  );
  const picked: number[] = [];
  for (const sectionId of weak) {
    if (picked.length >= count) break;
    const best = byCost.find(
      (q) => q.sectionId === sectionId && !picked.includes(q.id),
    );
    if (best) picked.push(best.id);
  }
  for (const q of byCost) {
    if (picked.length >= count) break;
    if (!picked.includes(q.id)) picked.push(q.id);
  }
  // Never hand out exactly the previous attempt when the pool has more:
  // swap its most expensive question for the cheapest unused one.
  const repeated =
    last.size > 0 &&
    picked.length === last.size &&
    picked.every((id) => last.has(id));
  if (repeated && input.pool.length > picked.length) {
    const spare = byCost.find((q) => !picked.includes(q.id));
    const worst = [...picked].sort((a, b) => cost.get(b)! - cost.get(a)!)[0];
    if (spare) picked[picked.indexOf(worst)] = spare.id;
  }
  return { ids: picked, target };
}

/**
 * v3 placement quiz: `perSection` questions per section with calibrated
 * difficulty closest to the reference b = 0 (ties by id) — the same items
 * for everyone, so the quiz measures each topic on a common scale.
 */
export function assemblePlacementTest(
  pool: PoolQuestion[],
  perSection: number,
): number[] {
  const bySection = new Map<number, PoolQuestion[]>();
  for (const q of pool) {
    const list = bySection.get(q.sectionId) ?? [];
    list.push(q);
    bySection.set(q.sectionId, list);
  }
  return [...bySection.keys()]
    .sort((a, b) => a - b)
    .flatMap((sectionId) =>
      [...bySection.get(sectionId)!]
        .sort((a, b) => Math.abs(a.b) - Math.abs(b.b) || a.id - b.id)
        .slice(0, perSection)
        .map((q) => q.id),
    );
}

// ───────────────────────────── recommendations ─────────────────────────────

export type RecommendationType =
  | 'REVIEW'
  | 'RETRY_TEST'
  | 'NEXT'
  | 'SKIP_AHEAD'
  | 'CHALLENGE'
  | 'DEADLINE';

export interface CourseLessonInfo {
  id: number;
  title: string;
  completed: boolean;
  /** Test attached to the lesson, with the student's latest score (if any). */
  test?: { id: number; lastScore: number | null; passingScore: number } | null;
  /** Share of wrongly answered questions of this lesson's test, 0..1. */
  wrongShare?: number;
  /** Assignment attached to the lesson. */
  assignment?: { id: number; dueAt: number | null; submitted: boolean } | null;
  /** v3: when the student last studied the lesson (ms), if known. */
  lastStudiedAt?: number | null;
}

export interface CourseSectionInfo {
  id: number;
  title: string;
  lessons: CourseLessonInfo[];
}

export interface Recommendation {
  /** Stable key `TYPE:target`, logged when shown/opened. */
  key: string;
  type: RecommendationType;
  sectionId: number;
  lessonId?: number;
  testId?: number;
  assignmentId?: number;
  priority: number;
  /** i18n key on the frontend + parameters. */
  reason: string;
  params: Record<string, string | number>;
}

export interface RecommendInput {
  sections: CourseSectionInfo[];
  mastery: Map<number, MasteryState>;
  thresholds: Thresholds;
  now: number;
  topN?: number;
  /** v3: last practice (lesson or answer) per section, ms. */
  lastPractice?: Map<number, number>;
}

const DAY = 86_400_000;

/**
 * Explainable priority:
 *   priority = base(type) + w_gap·max(0, τ − m) + w_wrong·wrongShare
 *            + w_dead·urgency(section) + w_seq·(1 − position/total)
 * τ — mastery threshold, urgency = 1 − daysLeft / horizon for the nearest
 * unsubmitted deadline of the section (0 when none).
 */
export function recommend(
  input: RecommendInput,
  cfg: AdaptiveConfig = ADAPTIVE_CONFIG,
): Recommendation[] {
  const { sections, thresholds: t, now } = input;
  const w = cfg.priority;
  const all = sections.flatMap((s) => s.lessons);
  const total = Math.max(1, all.length);
  const position = new Map(all.map((l, i) => [l.id, i]));
  const stateOf = (sectionId: number) =>
    input.mastery.get(sectionId) ?? priorMastery(cfg);

  const urgency = (s: CourseSectionInfo) => {
    let best = 0;
    for (const l of s.lessons) {
      const a = l.assignment;
      if (!a || a.submitted || a.dueAt === null || a.dueAt < now) continue;
      const days = (a.dueAt - now) / DAY;
      if (days <= cfg.deadlineHorizonDays)
        best = Math.max(best, 1 - days / cfg.deadlineHorizonDays);
    }
    return best;
  };

  const out: Recommendation[] = [];
  const pct = (m: number) => Math.round(m * 100);

  /**
   * Soft gating (v2): a weak topic whose lessons are all completed and whose
   * test was attempted is «engaged» — it no longer blocks NEXT and its
   * REVIEW / RETRY suggestions drop below the next lesson.
   */
  const engaged = (s: CourseSectionInfo) =>
    cfg.softGating &&
    s.lessons.every((l) => l.completed) &&
    s.lessons.every((l) => !l.test || l.test.lastScore !== null);

  sections.forEach((s, si) => {
    const st = stateOf(s.id);
    const level = masteryLevel(st, t, cfg);
    const gap = Math.max(0, t.masteryThreshold - st.mastery);
    const urg = urgency(s);
    const demote = engaged(s) ? w.demote : 0;

    if (level === 'weak') {
      // Review: lessons with most wrong answers first, then incomplete ones.
      const lessons = [...s.lessons].sort(
        (a, b) =>
          (b.wrongShare ?? 0) - (a.wrongShare ?? 0) ||
          Number(a.completed) - Number(b.completed),
      );
      for (const l of cfg.reviewAllLessons ? lessons : lessons.slice(0, 2)) {
        out.push({
          key: `REVIEW:${l.id}`,
          type: 'REVIEW',
          sectionId: s.id,
          lessonId: l.id,
          priority:
            w.review +
            w.gap * gap +
            w.wrongShare * (l.wrongShare ?? 0) +
            w.deadlineBoost * urg -
            demote,
          reason: 'review',
          params: {
            section: s.title,
            lesson: l.title,
            mastery: pct(st.mastery),
          },
        });
      }
      const test = s.lessons.find((l) => l.test)?.test;
      if (test) {
        // v3 retrieval practice: once every lesson was studied, retest first.
        const reviewTop = Math.max(
          ...out
            .filter((r) => r.type === 'REVIEW' && r.sectionId === s.id)
            .map((r) => r.priority),
        );
        const retrieval =
          cfg.retrievalPractice && s.lessons.every((l) => l.completed)
            ? Math.max(
                0,
                reviewTop +
                  0.05 -
                  (w.retry + w.gap * gap + w.deadlineBoost * urg - demote),
              )
            : 0;
        out.push({
          key: `RETRY_TEST:${test.id}`,
          type: 'RETRY_TEST',
          sectionId: s.id,
          testId: test.id,
          priority:
            w.retry + w.gap * gap + w.deadlineBoost * urg - demote + retrieval,
          reason: 'retry',
          params: {
            section: s.title,
            score: test.lastScore ?? 0,
            mastery: pct(st.mastery),
          },
        });
      }
    }

    if (level === 'mastered') {
      const left = s.lessons.filter((l) => !l.completed);
      const nextSection = sections[si + 1];
      if (left.length) {
        const target =
          nextSection?.lessons.find((l) => !l.completed) ?? left[0];
        out.push({
          key: `SKIP_AHEAD:${s.id}`,
          type: 'SKIP_AHEAD',
          sectionId: s.id,
          lessonId: target.id,
          priority: w.skip + (st.mastery - t.accelerationThreshold),
          reason: 'skip',
          params: {
            section: s.title,
            optional: left.length,
            lesson: target.title,
            mastery: pct(st.mastery),
          },
        });
      }
      const test = s.lessons.find((l) => l.test)?.test;
      if (test) {
        out.push({
          key: `CHALLENGE:${test.id}`,
          type: 'CHALLENGE',
          sectionId: s.id,
          testId: test.id,
          priority: w.challenge,
          reason: 'challenge',
          params: { section: s.title, mastery: pct(st.mastery) },
        });
      }
    }

    // Deadlines: unsubmitted work due soon; a weak topic makes it urgent.
    for (const l of s.lessons) {
      const a = l.assignment;
      if (!a || a.submitted || a.dueAt === null || a.dueAt < now) continue;
      const days = (a.dueAt - now) / DAY;
      if (days > cfg.deadlineHorizonDays) continue;
      out.push({
        key: `DEADLINE:${a.id}`,
        type: 'DEADLINE',
        sectionId: s.id,
        lessonId: l.id,
        assignmentId: a.id,
        priority:
          w.deadline * (1 - days / cfg.deadlineHorizonDays) +
          (level === 'weak' ? w.gap * gap : 0),
        reason: 'deadline',
        params: { lesson: l.title, days: Math.max(0, Math.ceil(days)) },
      });
    }
  });

  // Next: the first incomplete lesson whose earlier topics are not weak
  // (v2: or are weak but already studied and tested — soft gating).
  let blocked = false;
  const skipped = (s: CourseSectionInfo) =>
    cfg.skipMasteredInNext &&
    masteryLevel(stateOf(s.id), t, cfg) === 'mastered';
  for (const s of sections) {
    if (skipped(s)) continue; // v3: a mastered topic's lessons are optional
    const lesson = s.lessons.find((l) => !l.completed);
    if (lesson && !blocked) {
      const pos = position.get(lesson.id) ?? 0;
      out.push({
        key: `NEXT:${lesson.id}`,
        type: 'NEXT',
        sectionId: s.id,
        lessonId: lesson.id,
        priority: w.next + w.sequence * (1 - pos / total),
        reason: 'next',
        params: { section: s.title, lesson: lesson.title },
      });
      break;
    }
    if (masteryLevel(stateOf(s.id), t, cfg) === 'weak' && !engaged(s))
      blocked = true;
  }

  // Spaced review of all topics (v3): once every lesson is done (or optional
  // in a mastered topic), each topic offers its least recently studied lesson
  // with priority w_spaced · (1 − m · e^{−Δt/H}) — predicted forgetting × gap.
  const courseDone = sections.every(
    (s) => skipped(s) || s.lessons.every((l) => l.completed),
  );
  if (cfg.spacedAll && courseDone) {
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].type === 'REVIEW' || out[i].type === 'RETRY_TEST')
        out.splice(i, 1);
    }
    for (const s of sections) {
      if (!s.lessons.length) continue;
      const st = stateOf(s.id);
      const last = input.lastPractice?.get(s.id);
      const decay =
        last === undefined ? 1 : Math.exp(-(now - last) / cfg.forgetHorizonMs);
      const gap = 1 - st.mastery * decay;
      const lesson = [...s.lessons].sort(
        (a, b) =>
          (a.lastStudiedAt ?? -Infinity) - (b.lastStudiedAt ?? -Infinity) ||
          a.id - b.id,
      )[0];
      out.push({
        key: `REVIEW:${lesson.id}`,
        type: 'REVIEW',
        sectionId: s.id,
        lessonId: lesson.id,
        priority: w.spaced * gap,
        reason: 'review',
        params: {
          section: s.title,
          lesson: lesson.title,
          mastery: pct(st.mastery),
        },
      });
    }
  }

  // Spaced review (v2): the course is completed and nothing is weak — keep
  // the weakest topic fresh (counteracts forgetting; lowest priority).
  if (
    !cfg.spacedAll &&
    cfg.spacedReview &&
    all.every((l) => l.completed) &&
    !out.some((r) => r.type === 'REVIEW' || r.type === 'RETRY_TEST')
  ) {
    const weakest = [...sections]
      .filter((s) => s.lessons.length)
      .sort((a, b) => stateOf(a.id).mastery - stateOf(b.id).mastery)[0];
    if (weakest) {
      const st = stateOf(weakest.id);
      for (const l of weakest.lessons) {
        out.push({
          key: `REVIEW:${l.id}`,
          type: 'REVIEW',
          sectionId: weakest.id,
          lessonId: l.id,
          priority: w.spaced * (1 - st.mastery),
          reason: 'review',
          params: {
            section: weakest.title,
            lesson: l.title,
            mastery: pct(st.mastery),
          },
        });
      }
    }
  }

  // One entry per key (highest priority), then by priority and course order.
  const best = new Map<string, Recommendation>();
  for (const r of out) {
    const prev = best.get(r.key);
    if (!prev || r.priority > prev.priority) best.set(r.key, r);
  }
  return [...best.values()]
    .map((r) => ({ ...r, priority: Math.round(r.priority * 1000) / 1000 }))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (position.get(a.lessonId ?? -1) ?? 0) -
          (position.get(b.lessonId ?? -1) ?? 0),
    )
    .slice(0, input.topN ?? cfg.topN);
}

// ───────────────────────────── A/B experiment ─────────────────────────────

export type Group = 'ADAPTIVE' | 'CONTROL';

/** Balanced assignment of a newcomer: the smaller arm, ties at random. */
export function assignGroup(
  counts: { ADAPTIVE: number; CONTROL: number },
  rng: () => number = Math.random,
): Group {
  if (counts.ADAPTIVE < counts.CONTROL) return 'ADAPTIVE';
  if (counts.CONTROL < counts.ADAPTIVE) return 'CONTROL';
  return rng() < 0.5 ? 'ADAPTIVE' : 'CONTROL';
}

/** Random balanced split of existing students (|A − C| ≤ 1). */
export function splitGroups<T>(
  items: T[],
  rng: () => number = Math.random,
): Map<T, Group> {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  const first: Group = rng() < 0.5 ? 'ADAPTIVE' : 'CONTROL';
  const second: Group = first === 'ADAPTIVE' ? 'CONTROL' : 'ADAPTIVE';
  return new Map(a.map((x, i) => [x, i % 2 === 0 ? first : second]));
}

/** Adaptive behaviour (recommendations, adaptive tests) for this student? */
export function adaptiveFor(
  settings: { enabled: boolean; experimentMode: 'OFF' | 'AB_TEST' },
  group: Group | null,
): boolean {
  if (!settings.enabled) return false;
  if (settings.experimentMode === 'AB_TEST') return group === 'ADAPTIVE';
  return true;
}
