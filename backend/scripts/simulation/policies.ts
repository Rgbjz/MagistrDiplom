/**
 * The two compared policies. ADAPTIVE drives the learner with the REAL
 * adaptation module (learner model, recommendations, adaptive tests); the
 * system only observes answers and lesson completions, never true knowledge.
 */
import {
  ADAPTIVE_CONFIG_V1,
  assembleAdaptiveTest,
  eloUpdate,
  initialDifficulty,
  masteryLevel,
  priorMastery,
  recommend,
  updateMastery,
  type AdaptiveConfig,
  type CourseSectionInfo,
  type EloState,
  type MasteryState,
  type QuestionCalibration,
  type Recommendation,
  type Thresholds,
} from '../../src/modules/adaptive/adaptive.algorithm';
import {
  answer,
  settle,
  SIM_CONFIG,
  studyLesson,
  type SimConfig,
  type SimCourse,
  type SimLearner,
  type SimLesson,
  type SimQuestion,
} from './model';
import type { Rng } from './prng';

export type Policy = 'ADAPTIVE' | 'CONTROL';

/** Item calibration shared by a cohort (the LMS calibrates from all answers). */
export type CalibrationStore = Map<number, QuestionCalibration>;

export interface RunOptions {
  policy: Policy;
  course: SimCourse;
  learner: SimLearner;
  rng: Rng;
  calibration: CalibrationStore;
  sim?: SimConfig;
  adaptive?: AdaptiveConfig;
  thresholds?: Thresholds;
  /** Proposed modifications evaluated as ablations (default: the module as is). */
  variant?: Variant;
}

/**
 * Ablation switches (NOT part of the deployed module unless noted):
 * - masteryModel 'elo': topic mastery m_t = σ(θ_t) from a per-topic Elo
 *   ability instead of the EWMA of raw scores (robust to adaptive item
 *   difficulty, Pelánek 2016);
 * - reviewCap: after this many REVIEW actions on a topic it no longer blocks
 *   NEXT (soft prerequisite gating);
 * - evidenceGate: a topic counts as «weak» only after at least one test
 *   answer on it — lesson completions alone keep it «unknown» (fixes the
 *   cold start where m ≈ 0.515 < τ after the first lesson).
 */
export interface Variant {
  masteryModel?: 'ewma' | 'elo';
  reviewCap?: number | null;
  evidenceGate?: boolean;
}

export const DEFAULT_VARIANT: Required<Variant> = {
  masteryModel: 'ewma',
  reviewCap: null,
  evidenceGate: false,
};

export interface RunLog {
  /** Minute when every topic test was passed once (course completed), or null. */
  completedAt: number | null;
  /** Minute when every topic reached true k ≥ masteredAt, or null. */
  allMasteredAt: number | null;
  lessonsStudied: number;
  /** Lesson studies on a topic already truly mastered (k ≥ masteredAt). */
  wastedLessons: number;
  testsTaken: number;
  retakes: number;
  questionsAnswered: number;
  actions: Record<string, number>;
  /** System model at the end (for calibration quality). */
  mastery: MasteryState[];
  theta: number;
}

interface SystemModel {
  mastery: MasteryState[];
  elo: EloState;
  /** Per-topic Elo ability (variant masteryModel = 'elo'). */
  topicElo: EloState[];
}

function newModel(topics: number, cfg: AdaptiveConfig): SystemModel {
  return {
    mastery: Array.from({ length: topics }, () => priorMastery(cfg)),
    elo: { theta: 0, answers: 0 },
    topicElo: Array.from({ length: topics }, () => ({ theta: 0, answers: 0 })),
  };
}

/** Lesson completion nudges the per-topic ability (expected learning). */
const LESSON_THETA_NUDGE = 0.15;

function calibrationOf(
  store: CalibrationStore,
  q: SimQuestion,
  cfg: AdaptiveConfig,
) {
  return store.get(q.id) ?? { b: initialDifficulty(q.level, cfg), count: 0 };
}

/**
 * One evidence pipeline for both policies (the LMS tracks the model for the
 * control group too): mastery EWMA + Elo update after every answer.
 */
function observeAnswer(
  model: SystemModel,
  store: CalibrationStore,
  q: SimQuestion,
  r: number,
  cfg: AdaptiveConfig,
) {
  model.mastery[q.topic] = updateMastery(
    model.mastery[q.topic],
    { kind: 'question', score: r, difficulty: q.level },
    cfg,
  );
  const cal = calibrationOf(store, q, cfg);
  // Per-topic ability uses the item difficulty but does not re-calibrate it.
  model.topicElo[q.topic] = eloUpdate(
    model.topicElo[q.topic],
    cal,
    r,
    cfg,
  ).student;
  const next = eloUpdate(model.elo, cal, r, cfg);
  model.elo = next.student;
  store.set(q.id, next.question);
}

function observeLesson(model: SystemModel, topic: number, cfg: AdaptiveConfig) {
  const te = model.topicElo[topic];
  model.topicElo[topic] = {
    theta: te.theta + LESSON_THETA_NUDGE,
    answers: te.answers,
  };
  model.mastery[topic] = updateMastery(
    model.mastery[topic],
    { kind: 'lesson', score: cfg.lessonCompletionScore },
    cfg,
  );
}

export function runLearner(o: RunOptions): RunLog {
  const sim = o.sim ?? SIM_CONFIG;
  const cfg = o.adaptive ?? ADAPTIVE_CONFIG_V1;
  const t: Thresholds = o.thresholds ?? {
    masteryThreshold: cfg.masteryThreshold,
    accelerationThreshold: cfg.accelerationThreshold,
  };
  const { course, learner: l, rng } = o;
  const variant = { ...DEFAULT_VARIANT, ...o.variant };
  const topics = course.pool.length;
  const model = newModel(topics, cfg);
  const reviews: number[] = Array(topics).fill(0) as number[];
  /** Mastery the decisions are based on (deployed: EWMA; variant: σ(θ_t)). */
  const decisionMastery = (topic: number): MasteryState => {
    const ewma = model.mastery[topic];
    let m: MasteryState =
      variant.masteryModel === 'elo'
        ? {
            mastery: 1 / (1 + Math.exp(-model.topicElo[topic].theta)),
            evidence: ewma.evidence,
          }
        : ewma;
    if (variant.evidenceGate && model.topicElo[topic].answers === 0) {
      // No test evidence yet: «unknown», never «weak» (n = 0 for the level rule).
      return { mastery: m.mastery, evidence: 0 };
    }
    if (
      variant.reviewCap !== null &&
      reviews[topic] >= variant.reviewCap &&
      m.mastery < t.masteryThreshold
    ) {
      // Soft gating: the topic stays «weak» for the student but stops blocking.
      m = { ...m, mastery: t.masteryThreshold };
    }
    return m;
  };
  const completed = new Set<number>();
  const passed = new Set<number>();
  const lastScore: (number | null)[] = Array(topics).fill(null) as (
    | number
    | null
  )[];
  const lastAttempt: number[][] = Array.from({ length: topics }, () => []);
  const log: RunLog = {
    completedAt: null,
    allMasteredAt: null,
    lessonsStudied: 0,
    wastedLessons: 0,
    testsTaken: 0,
    retakes: 0,
    questionsAnswered: 0,
    actions: {},
    mastery: [],
    theta: 0,
  };
  const count = (a: string) => (log.actions[a] = (log.actions[a] ?? 0) + 1);
  const timeLeft = () => sim.budget - l.clock;

  const checkMilestones = () => {
    if (log.completedAt === null && passed.size === topics)
      log.completedAt = l.clock;
    if (log.allMasteredAt === null && l.k.every((k) => k >= sim.masteredAt))
      log.allMasteredAt = l.clock;
  };

  const study = (lesson: SimLesson) => {
    if (l.k[lesson.topic] >= sim.masteredAt) log.wastedLessons++;
    studyLesson(l, lesson, sim);
    log.lessonsStudied++;
    if (!completed.has(lesson.id)) {
      completed.add(lesson.id);
      observeLesson(model, lesson.topic, cfg);
    }
    checkMilestones();
  };

  const takeTest = (topic: number, questions: SimQuestion[]) => {
    if (passed.has(topic) || lastScore[topic] !== null) log.retakes++;
    log.testsTaken++;
    let hits = 0;
    for (const q of questions) {
      if (timeLeft() < sim.time.question) break;
      const r = answer(l, q, rng, sim);
      hits += r;
      log.questionsAnswered++;
      observeAnswer(model, o.calibration, q, r, cfg);
    }
    const score = questions.length ? hits / questions.length : 0;
    lastScore[topic] = score;
    lastAttempt[topic] = questions.map((q) => q.id);
    if (score >= sim.course.passingScore) passed.add(topic);
    checkMilestones();
    return score;
  };

  if (o.policy === 'CONTROL') runControl();
  else runAdaptive();

  settle(l, sim);
  log.mastery = model.mastery.map((_, i) => decisionMastery(i));
  log.theta = model.elo.theta;
  return log;

  // ── CONTROL: fixed linear path, fixed tests, retake on fail, then revision ──
  function runControl() {
    const fixedTest = (topic: number) => {
      // The same questions for everybody: the first two of each level.
      const pool = course.pool[topic];
      const out: SimQuestion[] = [];
      for (const level of [1, 2, 3]) {
        out.push(
          ...pool
            .filter((q) => q.level === level)
            .slice(0, sim.course.testSize / 3),
        );
      }
      return out;
    };
    const lessonCost = sim.time.lesson;
    const testCost = sim.course.testSize * sim.time.question;
    for (let topic = 0; topic < topics; topic++) {
      for (const lesson of course.lessons.filter((x) => x.topic === topic)) {
        if (timeLeft() < lessonCost) return;
        count('LESSON');
        study(lesson);
      }
      // Retake the same test on fail, at most twice, then move on.
      for (let attempt = 0; attempt < 3; attempt++) {
        if (timeLeft() < testCost) return;
        count('TEST');
        if (takeTest(topic, fixedTest(topic)) >= sim.course.passingScore) break;
      }
    }
    // Leftover time: uniform revision of all lessons in course order.
    for (let i = 0; timeLeft() >= lessonCost; i++) {
      count('REVISION');
      study(course.lessons[i % course.lessons.length]);
    }
  }

  // ── ADAPTIVE: follow the module's recommendations ──
  function runAdaptive() {
    const sectionsInfo = (): CourseSectionInfo[] =>
      Array.from({ length: topics }, (_, topic) => ({
        id: topic + 1,
        title: `T${topic + 1}`,
        lessons: course.lessons
          .filter((x) => x.topic === topic)
          .map((x) => ({
            id: x.id,
            title: `L${x.id}`,
            completed: completed.has(x.id),
            test: x.hasTest
              ? {
                  id: topic + 1,
                  lastScore:
                    lastScore[topic] === null
                      ? null
                      : Math.round(lastScore[topic] * 100),
                  passingScore: sim.course.passingScore * 100,
                }
              : null,
            wrongShare:
              x.hasTest && lastScore[topic] !== null ? 1 - lastScore[topic] : 0,
            assignment: null,
          })),
      }));

    const adaptiveTest = (topic: number) => {
      const weak = masteryLevel(decisionMastery(topic), t, cfg) === 'weak';
      const pool = course.pool[topic];
      const picked = assembleAdaptiveTest({
        pool: pool.map((q) => ({
          id: q.id,
          b: calibrationOf(o.calibration, q, cfg).b,
          sectionId: topic + 1,
        })),
        count: sim.course.testSize,
        theta: model.elo.theta,
        weakSectionIds: weak ? [topic + 1] : [],
        lastAttemptIds: lastAttempt[topic],
        targetP: cfg.targetP,
        rng,
      });
      const byId = new Map(pool.map((q) => [q.id, q]));
      return picked.ids.map((id) => byId.get(id)!);
    };

    const lessonById = new Map(course.lessons.map((x) => [x.id, x]));
    // Student behaviour: follow the list top-down, but don't redo an item
    // already done for a topic until that topic gets new evidence.
    const doneSince: Set<string>[] = Array.from(
      { length: topics },
      () => new Set(),
    );
    const evidenceCount = () => model.mastery.map((m) => m.evidence);
    let lastEvidence = evidenceCount();

    while (timeLeft() >= sim.time.question) {
      const recs: Recommendation[] = recommend(
        {
          sections: sectionsInfo(),
          mastery: new Map(
            model.mastery.map((_, i) => [i + 1, decisionMastery(i)]),
          ),
          thresholds: t,
          now: 0,
          topN: 10,
        },
        cfg,
      );
      const rec = recs.find((r) => !doneSince[r.sectionId - 1].has(r.key));
      if (!rec) {
        // Nothing new to do: practise the least-mastered topic.
        const topic = model.mastery
          .map((_, i) => [decisionMastery(i).mastery, i] as const)
          .sort((a, b) => a[0] - b[0])[0][1];
        count('PRACTICE');
        takeTest(topic, adaptiveTest(topic));
      } else {
        const topic = rec.sectionId - 1;
        count(rec.type);
        if (rec.type === 'REVIEW') reviews[topic]++;
        doneSince[topic].add(rec.key);
        if (rec.type === 'RETRY_TEST' || rec.type === 'CHALLENGE') {
          takeTest(topic, adaptiveTest(topic));
        } else if (rec.type === 'SKIP_AHEAD') {
          // Remaining lessons of the mastered topic become optional.
          for (const x of course.lessons) {
            if (x.topic === topic) completed.add(x.id);
          }
          const target = lessonById.get(rec.lessonId!)!;
          if (timeLeft() < sim.time.lesson) break;
          study(target);
          if (target.hasTest && timeLeft() >= sim.time.question)
            takeTest(target.topic, adaptiveTest(target.topic));
        } else {
          // NEXT / REVIEW / DEADLINE → study the lesson (topic test after its last lesson).
          const lesson = lessonById.get(rec.lessonId!)!;
          if (timeLeft() < sim.time.lesson) break;
          const first = !completed.has(lesson.id);
          study(lesson);
          if (lesson.hasTest && first && timeLeft() >= sim.time.question)
            takeTest(lesson.topic, adaptiveTest(lesson.topic));
        }
      }
      // New evidence on a topic re-opens its recommendations.
      const now = evidenceCount();
      now.forEach((n, i) => {
        if (n !== lastEvidence[i]) doneSince[i].clear();
      });
      lastEvidence = now;
    }
  }
}
