import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdaptiveGroup,
  CourseAdaptiveSettings,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { assertCourseRole } from '../../common/access/course-access';
import { displayName } from '../../common/utils/names';
import {
  ADAPTIVE_CONFIG,
  adaptiveFor,
  assembleAdaptiveTest,
  assignGroup,
  eloUpdate,
  initialDifficulty,
  masteryLevel,
  priorMastery,
  recommend,
  replayHistory,
  splitGroups,
  updateMastery,
  type CourseSectionInfo,
  type Evidence,
  type HistoryEvent,
  type MasteryState,
  type Recommendation,
  type Thresholds,
} from './adaptive.algorithm';

export type SettingsView = Pick<
  CourseAdaptiveSettings,
  | 'enabled'
  | 'masteryThreshold'
  | 'accelerationThreshold'
  | 'adaptiveTestsDefault'
  | 'experimentMode'
  | 'experimentStartedAt'
>;

const DEFAULT_SETTINGS: SettingsView = {
  enabled: true,
  masteryThreshold: ADAPTIVE_CONFIG.masteryThreshold,
  accelerationThreshold: ADAPTIVE_CONFIG.accelerationThreshold,
  adaptiveTestsDefault: false,
  experimentMode: 'OFF',
  experimentStartedAt: null,
};

/** A recommendation counts as followed if acted on within this window. */
const FOLLOW_WINDOW_MS = 7 * 86_400_000;
/** The same recommendation is logged as shown at most once per window. */
const SHOWN_DEDUPE_MS = 6 * 3_600_000;

export interface PoolItem {
  id: number;
  difficulty: number;
  calibratedDifficulty: number | null;
}

export interface UpdateSettingsInput {
  enabled?: boolean;
  masteryThreshold?: number;
  accelerationThreshold?: number;
  adaptiveTestsDefault?: boolean;
  experimentMode?: 'OFF' | 'AB_TEST';
}

/**
 * Adaptation module: keeps the learner model (section mastery, ability θ,
 * question calibration b) up to date from learning events, recommends what
 * to do next and assembles adaptive tests. Pure maths: adaptive.algorithm.ts.
 */
@Injectable()
export class AdaptiveService {
  private readonly logger = new Logger(AdaptiveService.name);
  /** Overridable in unit tests. */
  rng: () => number = Math.random;

  constructor(private prisma: PrismaService) {}

  // ───────────────────────── settings & groups ─────────────────────────

  async settings(courseId: number): Promise<SettingsView> {
    const row = await this.prisma.courseAdaptiveSettings.findUnique({
      where: { courseId },
    });
    return row ?? DEFAULT_SETTINGS;
  }

  private thresholds(s: SettingsView): Thresholds {
    return {
      masteryThreshold: s.masteryThreshold,
      accelerationThreshold: s.accelerationThreshold,
    };
  }

  /**
   * The student's experiment arm. While an A/B test runs, students without
   * an arm (enrolled after it started) join the smaller one.
   */
  async groupOf(
    userId: number,
    courseId: number,
    s: SettingsView,
  ): Promise<AdaptiveGroup | null> {
    if (s.experimentMode !== 'AB_TEST') return null;
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { id: true, adaptiveGroup: true },
    });
    if (!enrollment) return null;
    if (enrollment.adaptiveGroup) return enrollment.adaptiveGroup;
    const counts = await this.prisma.enrollment.groupBy({
      by: ['adaptiveGroup'],
      where: { courseId, adaptiveGroup: { not: null } },
      _count: { _all: true },
    });
    const n = { ADAPTIVE: 0, CONTROL: 0 };
    for (const c of counts)
      if (c.adaptiveGroup) n[c.adaptiveGroup] = c._count._all;
    const group = assignGroup(n, this.rng);
    await this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { adaptiveGroup: group },
    });
    return group;
  }

  async isAdaptiveFor(userId: number, courseId: number) {
    const s = await this.settings(courseId);
    const group = await this.groupOf(userId, courseId, s);
    return { settings: s, group, adaptive: adaptiveFor(s, group) };
  }

  async updateSettings(
    courseId: number,
    input: UpdateSettingsInput,
    user: AuthUser,
  ) {
    await assertCourseRole(this.prisma, courseId, user, 'manage');
    const before = await this.settings(courseId);
    const next = { ...before, ...input };
    if (next.accelerationThreshold <= next.masteryThreshold) {
      next.accelerationThreshold = Math.min(1, next.masteryThreshold + 0.05);
    }
    const startExperiment =
      next.experimentMode === 'AB_TEST' && before.experimentMode !== 'AB_TEST';
    const data = {
      enabled: next.enabled,
      masteryThreshold: next.masteryThreshold,
      accelerationThreshold: next.accelerationThreshold,
      adaptiveTestsDefault: next.adaptiveTestsDefault,
      experimentMode: next.experimentMode,
      experimentStartedAt: startExperiment
        ? new Date()
        : next.experimentMode === 'AB_TEST'
          ? before.experimentStartedAt
          : null,
    };
    await this.prisma.courseAdaptiveSettings.upsert({
      where: { courseId },
      create: { courseId, ...data },
      update: data,
    });
    if (startExperiment) {
      // A fresh experiment: every active student gets a new balanced arm.
      const students = await this.prisma.enrollment.findMany({
        where: { courseId, status: { in: ['ACTIVE', 'COMPLETED'] } },
        select: { id: true },
      });
      const split = splitGroups(
        students.map((s) => s.id),
        this.rng,
      );
      await this.prisma.$transaction(
        [...split].map(([id, group]) =>
          this.prisma.enrollment.update({
            where: { id },
            data: { adaptiveGroup: group },
          }),
        ),
      );
    }
    return this.settings(courseId);
  }

  // ───────────────────────── model updates ─────────────────────────

  private async loadMastery(userId: number, sectionId: number) {
    const row = await this.prisma.learnerSectionMastery.findUnique({
      where: { userId_sectionId: { userId, sectionId } },
    });
    return row
      ? { mastery: row.mastery, evidence: row.evidence }
      : priorMastery();
  }

  private saveMastery(
    userId: number,
    courseId: number,
    sectionId: number,
    st: MasteryState,
  ) {
    return this.prisma.learnerSectionMastery.upsert({
      where: { userId_sectionId: { userId, sectionId } },
      create: { userId, courseId, sectionId, ...st },
      update: st,
    });
  }

  private async applyEvidence(
    userId: number,
    courseId: number,
    sectionId: number,
    evidence: Evidence[],
    source: Record<string, unknown>,
  ) {
    if (!evidence.length) return;
    let st = await this.loadMastery(userId, sectionId);
    const before = st.mastery;
    for (const e of evidence) st = updateMastery(st, e);
    await this.saveMastery(userId, courseId, sectionId, st);
    await this.log(userId, courseId, 'MASTERY_UPDATED', null, {
      ...source,
      sectionId,
      before: round3(before),
      after: round3(st.mastery),
      evidence: st.evidence,
    });
  }

  /** Never let the adaptation module break the learning flow it observes. */
  private async safely(what: string, fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(`${what} failed: ${(err as Error).message}`);
    }
  }

  /** After a test attempt: graded answers update mastery, θ and b. */
  onTestSubmitted(testResultId: number) {
    return this.safely('test update', () =>
      this.updateFromAnswers({ testResultId }),
    );
  }

  /** An essay answer was graded by the teacher. */
  onEssayGraded(attemptQuestionId: number) {
    return this.safely('essay update', () =>
      this.updateFromAnswers({ id: attemptQuestionId }),
    );
  }

  private async updateFromAnswers(where: Prisma.AttemptQuestionWhereInput) {
    const rows = await this.prisma.attemptQuestion.findMany({
      where: { ...where, status: { in: ['AUTO', 'GRADED'] } },
      orderBy: { position: 'asc' },
      include: {
        question: {
          select: {
            id: true,
            difficulty: true,
            calibratedDifficulty: true,
            calibrationCount: true,
          },
        },
        testResult: {
          select: {
            id: true,
            userId: true,
            test: {
              select: {
                lesson: {
                  select: {
                    sectionId: true,
                    section: { select: { courseId: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!rows.length) return;
    const tr = rows[0].testResult;
    const userId = tr.userId;
    const sectionId = tr.test.lesson.sectionId;
    const courseId = tr.test.lesson.section.courseId;

    const ab = await this.prisma.learnerAbility.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    let student = { theta: ab?.theta ?? 0, answers: ab?.answers ?? 0 };
    const evidence: Evidence[] = [];
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    for (const r of rows) {
      const score = r.maxPoints > 0 ? r.earned / r.maxPoints : 0;
      evidence.push({
        kind: 'question',
        score,
        difficulty: r.question.difficulty,
      });
      const q = {
        b:
          r.question.calibratedDifficulty ??
          initialDifficulty(r.question.difficulty),
        count: r.question.calibrationCount,
      };
      const next = eloUpdate(student, q, score);
      student = next.student;
      writes.push(
        this.prisma.question.update({
          where: { id: r.question.id },
          data: {
            calibratedDifficulty: next.question.b,
            calibrationCount: next.question.count,
          },
        }),
      );
    }
    writes.push(
      this.prisma.learnerAbility.upsert({
        where: { userId_courseId: { userId, courseId } },
        create: { userId, courseId, ...student },
        update: student,
      }),
    );
    await this.prisma.$transaction(writes);
    await this.applyEvidence(userId, courseId, sectionId, evidence, {
      source: 'test',
      testResultId: tr.id,
    });
  }

  /** A graded assignment: grade / maxScore is evidence for its section. */
  onAssignmentGraded(submissionId: number) {
    return this.safely('assignment update', async () => {
      const s = await this.prisma.submission.findUnique({
        where: { id: submissionId },
        select: {
          userId: true,
          score: true,
          assignment: {
            select: {
              id: true,
              maxScore: true,
              lesson: {
                select: {
                  sectionId: true,
                  section: { select: { courseId: true } },
                },
              },
            },
          },
        },
      });
      if (!s || s.score === null) return;
      const a = s.assignment;
      await this.applyEvidence(
        s.userId,
        a.lesson.section.courseId,
        a.lesson.sectionId,
        [{ kind: 'assignment', score: s.score / Math.max(1, a.maxScore) }],
        { source: 'assignment', assignmentId: a.id },
      );
    });
  }

  /** A completed lesson: weak evidence of engagement with the topic. */
  onLessonCompleted(userId: number, lessonId: number) {
    return this.safely('lesson update', async () => {
      const lesson = await this.prisma.lesson.findUnique({
        where: { id: lessonId },
        select: { sectionId: true, section: { select: { courseId: true } } },
      });
      if (!lesson) return;
      await this.applyEvidence(
        userId,
        lesson.section.courseId,
        lesson.sectionId,
        [{ kind: 'lesson', score: ADAPTIVE_CONFIG.lessonCompletionScore }],
        { source: 'lesson', lessonId },
      );
    });
  }

  /** Rebuilds the whole learner model of a course from its history. */
  async recompute(courseId: number, user?: AuthUser) {
    if (user) await assertCourseRole(this.prisma, courseId, user, 'manage');
    const history = await this.history(courseId);
    const result = replayHistory(history);
    const questionIds = await this.courseQuestionIds(courseId);
    await this.prisma.$transaction([
      this.prisma.learnerSectionMastery.deleteMany({ where: { courseId } }),
      this.prisma.learnerAbility.deleteMany({ where: { courseId } }),
      this.prisma.question.updateMany({
        where: { id: { in: questionIds } },
        data: { calibratedDifficulty: null, calibrationCount: 0 },
      }),
      this.prisma.learnerSectionMastery.createMany({
        data: [...result.mastery].map(([key, st]) => {
          const [userId, sectionId] = key.split(':').map(Number);
          return { userId, sectionId, courseId, ...st };
        }),
      }),
      this.prisma.learnerAbility.createMany({
        data: [...result.ability].map(([userId, st]) => ({
          userId,
          courseId,
          ...st,
        })),
      }),
      ...[...result.calibration].map(([id, c]) =>
        this.prisma.question.update({
          where: { id },
          data: { calibratedDifficulty: c.b, calibrationCount: c.count },
        }),
      ),
    ]);
    return {
      students:
        result.ability.size || new Set(history.map((h) => h.userId)).size,
      sections: result.mastery.size,
      events: history.length,
    };
  }

  private async courseQuestionIds(courseId: number) {
    const qs = await this.prisma.question.findMany({
      where: {
        OR: [
          { test: { lesson: { section: { courseId } } } },
          { category: { courseId } },
        ],
      },
      select: { id: true },
    });
    return qs.map((q) => q.id);
  }

  /** Time-ordered evidence of a course: answers, graded work, lessons. */
  async history(courseId: number): Promise<HistoryEvent[]> {
    const [answers, submissions, lessons] = await Promise.all([
      this.prisma.attemptQuestion.findMany({
        where: {
          status: { in: ['AUTO', 'GRADED'] },
          testResult: {
            finishedAt: { not: null },
            test: { lesson: { section: { courseId } } },
          },
        },
        select: {
          earned: true,
          maxPoints: true,
          gradedAt: true,
          position: true,
          question: { select: { id: true, difficulty: true } },
          testResult: {
            select: {
              userId: true,
              finishedAt: true,
              test: { select: { lesson: { select: { sectionId: true } } } },
            },
          },
        },
      }),
      this.prisma.submission.findMany({
        where: {
          score: { not: null },
          assignment: { lesson: { section: { courseId } } },
        },
        select: {
          userId: true,
          score: true,
          gradedAt: true,
          submittedAt: true,
          assignment: {
            select: { maxScore: true, lesson: { select: { sectionId: true } } },
          },
        },
      }),
      this.prisma.lessonProgress.findMany({
        where: { status: 'COMPLETED', lesson: { section: { courseId } } },
        select: {
          userId: true,
          completedAt: true,
          updatedAt: true,
          lesson: { select: { sectionId: true } },
        },
      }),
    ]);
    const events: HistoryEvent[] = [];
    events.push(...(await this.legacyAnswers(courseId)));
    for (const a of answers) {
      const at = (a.gradedAt ?? a.testResult.finishedAt)!.getTime();
      events.push({
        at: at + a.position, // keep the order within one attempt
        userId: a.testResult.userId,
        sectionId: a.testResult.test.lesson.sectionId,
        kind: 'question',
        score: a.maxPoints > 0 ? a.earned / a.maxPoints : 0,
        questionId: a.question.id,
        difficulty: a.question.difficulty,
      });
    }
    for (const s of submissions) {
      events.push({
        at: (s.gradedAt ?? s.submittedAt).getTime(),
        userId: s.userId,
        sectionId: s.assignment.lesson.sectionId,
        kind: 'assignment',
        score: (s.score ?? 0) / Math.max(1, s.assignment.maxScore),
      });
    }
    for (const l of lessons) {
      events.push({
        at: (l.completedAt ?? l.updatedAt).getTime(),
        userId: l.userId,
        sectionId: l.lesson.sectionId,
        kind: 'lesson',
        score: ADAPTIVE_CONFIG.lessonCompletionScore,
      });
    }
    return events.sort((a, b) => a.at - b.at);
  }

  /**
   * Attempts stored before per-attempt rows existed keep only the chosen
   * options (UserAnswer): a choice question is right when the chosen set
   * equals the set of correct options.
   */
  private async legacyAnswers(courseId: number): Promise<HistoryEvent[]> {
    const results = await this.prisma.testResult.findMany({
      where: {
        finishedAt: { not: null },
        questions: { none: {} },
        test: { lesson: { section: { courseId } } },
      },
      select: {
        userId: true,
        finishedAt: true,
        answers: { select: { questionId: true, answerId: true } },
        test: {
          select: {
            lesson: { select: { sectionId: true } },
            questions: {
              orderBy: { id: 'asc' },
              select: {
                id: true,
                type: true,
                difficulty: true,
                answers: { select: { id: true, isCorrect: true } },
              },
            },
          },
        },
      },
    });
    const events: HistoryEvent[] = [];
    for (const r of results) {
      r.test.questions.forEach((q, i) => {
        if (q.type !== 'SINGLE' && q.type !== 'MULTIPLE') return;
        const chosen = new Set(
          r.answers.filter((a) => a.questionId === q.id).map((a) => a.answerId),
        );
        const right = q.answers.filter((a) => a.isCorrect).map((a) => a.id);
        const ok =
          chosen.size === right.length && right.every((id) => chosen.has(id));
        events.push({
          at: r.finishedAt!.getTime() + i,
          userId: r.userId,
          sectionId: r.test.lesson.sectionId,
          kind: 'question',
          score: ok ? 1 : 0,
          questionId: q.id,
          difficulty: q.difficulty,
        });
      });
    }
    return events;
  }

  // ───────────────────────── adaptive test ─────────────────────────

  /**
   * Chooses the questions of a new attempt by the student's ability, or
   * returns null when the attempt should use the usual (fixed) draw.
   */
  async planAttempt(input: {
    userId: number;
    testId: number;
    testAdaptive: boolean | null;
    courseId: number;
    sectionId: number;
    pool: PoolItem[];
    count: number;
  }): Promise<{ ids: number[]; target: number; theta: number } | null> {
    const { settings, adaptive } = await this.isAdaptiveFor(
      input.userId,
      input.courseId,
    );
    const wanted = input.testAdaptive ?? settings.adaptiveTestsDefault;
    if (!adaptive || !wanted || input.pool.length === 0) return null;

    const [ab, weakRows, last] = await Promise.all([
      this.prisma.learnerAbility.findUnique({
        where: {
          userId_courseId: { userId: input.userId, courseId: input.courseId },
        },
      }),
      this.prisma.learnerSectionMastery.findMany({
        where: {
          userId: input.userId,
          courseId: input.courseId,
          mastery: { lt: settings.masteryThreshold },
          evidence: { gt: 0 },
        },
        select: { sectionId: true },
      }),
      this.prisma.testResult.findFirst({
        where: { userId: input.userId, testId: input.testId },
        orderBy: { attempt: 'desc' },
        select: { questions: { select: { questionId: true } } },
      }),
    ]);
    const theta = ab?.theta ?? 0;
    const plan = assembleAdaptiveTest({
      pool: input.pool.map((q) => ({
        id: q.id,
        b: q.calibratedDifficulty ?? initialDifficulty(q.difficulty),
        sectionId: input.sectionId,
      })),
      count: input.count,
      theta,
      weakSectionIds: weakRows.map((w) => w.sectionId),
      lastAttemptIds: last?.questions.map((q) => q.questionId) ?? [],
      rng: this.rng,
    });
    await this.log(
      input.userId,
      input.courseId,
      'ADAPTIVE_TEST_GENERATED',
      `TEST:${input.testId}`,
      {
        testId: input.testId,
        theta: round3(theta),
        target: round3(plan.target),
        questionIds: plan.ids,
        pool: input.pool.length,
      },
    );
    return { ...plan, theta };
  }

  // ───────────────────────── student view ─────────────────────────

  private async assertStudent(courseId: number, userId: number) {
    const e = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { status: true },
    });
    if (!e || (e.status !== 'ACTIVE' && e.status !== 'COMPLETED')) {
      throw new ForbiddenException('Not enrolled in this course');
    }
  }

  /** Course structure + the student's progress in the shape `recommend` needs. */
  private async courseInfo(courseId: number, userId: number) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        sections: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            title: true,
            lessons: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                title: true,
                test: { select: { id: true, passingScore: true } },
                assignment: { select: { id: true, dueAt: true } },
              },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    const lessonIds = course.sections.flatMap((s) =>
      s.lessons.map((l) => l.id),
    );
    const testIds = course.sections.flatMap((s) =>
      s.lessons.flatMap((l) => (l.test ? [l.test.id] : [])),
    );
    const assignmentIds = course.sections.flatMap((s) =>
      s.lessons.flatMap((l) => (l.assignment ? [l.assignment.id] : [])),
    );
    const [done, results, subs] = await Promise.all([
      this.prisma.lessonProgress.findMany({
        where: { userId, lessonId: { in: lessonIds }, status: 'COMPLETED' },
        select: { lessonId: true },
      }),
      // Only the last finished attempt of each test is used below; loading
      // every retake with its per-question rows grew linearly with retakes.
      this.prisma.testResult.findMany({
        where: { userId, testId: { in: testIds }, finishedAt: { not: null } },
        orderBy: [{ testId: 'asc' }, { attempt: 'desc' }],
        distinct: ['testId'],
        select: {
          testId: true,
          score: true,
          questions: {
            select: { earned: true, maxPoints: true, status: true },
          },
        },
      }),
      this.prisma.submission.findMany({
        where: { userId, assignmentId: { in: assignmentIds } },
        select: { assignmentId: true, status: true },
      }),
    ]);
    const completed = new Set(done.map((d) => d.lessonId));
    const lastByTest = new Map<number, (typeof results)[number]>();
    for (const r of results)
      if (!lastByTest.has(r.testId)) lastByTest.set(r.testId, r);
    const submitted = new Set(
      subs.filter((s) => s.status !== 'RETURNED').map((s) => s.assignmentId),
    );

    const sections: CourseSectionInfo[] = course.sections.map((s) => ({
      id: s.id,
      title: s.title,
      lessons: s.lessons.map((l) => {
        const last = l.test ? lastByTest.get(l.test.id) : undefined;
        const graded =
          last?.questions.filter((q) => q.status !== 'PENDING') ?? [];
        const wrong = graded.filter(
          (q) => q.earned < q.maxPoints - 1e-9,
        ).length;
        return {
          id: l.id,
          title: l.title,
          completed: completed.has(l.id),
          test: l.test
            ? {
                id: l.test.id,
                lastScore: last?.score ?? null,
                passingScore: l.test.passingScore,
              }
            : null,
          wrongShare: graded.length ? wrong / graded.length : 0,
          assignment: l.assignment
            ? {
                id: l.assignment.id,
                dueAt: l.assignment.dueAt?.getTime() ?? null,
                submitted: submitted.has(l.assignment.id),
              }
            : null,
        };
      }),
    }));
    return { course, sections };
  }

  private async masteryMap(userId: number, courseId: number) {
    const rows = await this.prisma.learnerSectionMastery.findMany({
      where: { userId, courseId },
    });
    return new Map(
      rows.map((r) => [
        r.sectionId,
        { mastery: r.mastery, evidence: r.evidence },
      ]),
    );
  }

  /** The student's learner model and personal recommendations in a course. */
  async me(courseId: number, user: AuthUser) {
    await this.assertStudent(courseId, user.id);
    const { settings, group, adaptive } = await this.isAdaptiveFor(
      user.id,
      courseId,
    );
    const { sections } = await this.courseInfo(courseId, user.id);
    const mastery = await this.masteryMap(user.id, courseId);
    const ab = await this.prisma.learnerAbility.findUnique({
      where: { userId_courseId: { userId: user.id, courseId } },
    });
    const t = this.thresholds(settings);
    const recommendations = adaptive
      ? recommend({ sections, mastery, thresholds: t, now: Date.now() })
      : [];
    await this.logShown(user.id, courseId, recommendations);
    return {
      enabled: settings.enabled,
      adaptive,
      group,
      thresholds: t,
      ability: ab ? { theta: round3(ab.theta), answers: ab.answers } : null,
      sections: sections.map((s) => {
        const st = mastery.get(s.id) ?? priorMastery();
        return {
          id: s.id,
          title: s.title,
          mastery: round3(st.mastery),
          evidence: st.evidence,
          level: masteryLevel(st, t),
        };
      }),
      recommendations,
    };
  }

  /** Top recommendations across all of the student's courses (dashboard). */
  async dashboard(user: AuthUser, limit = 3) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: user.id, status: 'ACTIVE' },
      select: { courseId: true, course: { select: { title: true } } },
    });
    const all: (Recommendation & { courseId: number; courseTitle: string })[] =
      [];
    for (const e of enrollments) {
      const { settings, adaptive } = await this.isAdaptiveFor(
        user.id,
        e.courseId,
      );
      if (!adaptive) continue;
      const { sections } = await this.courseInfo(e.courseId, user.id);
      const mastery = await this.masteryMap(user.id, e.courseId);
      const recs = recommend({
        sections,
        mastery,
        thresholds: this.thresholds(settings),
        now: Date.now(),
        topN: limit,
      });
      // NEXT is the «continue» block's job on the dashboard.
      for (const r of recs.filter((r) => r.type !== 'NEXT'))
        all.push({ ...r, courseId: e.courseId, courseTitle: e.course.title });
    }
    const top = all.sort((a, b) => b.priority - a.priority).slice(0, limit);
    for (const r of top) await this.logShown(user.id, r.courseId, [r]);
    return top;
  }

  private async logShown(
    userId: number,
    courseId: number,
    recs: Recommendation[],
  ) {
    if (!recs.length) return;
    const since = new Date(Date.now() - SHOWN_DEDUPE_MS);
    const recent = await this.prisma.adaptiveEvent.findMany({
      where: {
        userId,
        courseId,
        type: 'RECOMMENDATION_SHOWN',
        createdAt: { gte: since },
        key: { in: recs.map((r) => r.key) },
      },
      select: { key: true },
    });
    const seen = new Set(recent.map((r) => r.key));
    const fresh = recs.filter((r) => !seen.has(r.key));
    if (!fresh.length) return;
    await this.prisma.adaptiveEvent.createMany({
      data: fresh.map((r) => ({
        userId,
        courseId,
        type: 'RECOMMENDATION_SHOWN' as const,
        key: r.key,
        payload: {
          priority: r.priority,
          reason: r.reason,
          sectionId: r.sectionId,
        },
      })),
    });
  }

  async opened(courseId: number, key: string, user: AuthUser) {
    await this.assertStudent(courseId, user.id);
    await this.log(
      user.id,
      courseId,
      'RECOMMENDATION_OPENED',
      key.slice(0, 64),
      null,
    );
    return { ok: true };
  }

  private log(
    userId: number,
    courseId: number,
    type:
      | 'RECOMMENDATION_SHOWN'
      | 'RECOMMENDATION_OPENED'
      | 'MASTERY_UPDATED'
      | 'ADAPTIVE_TEST_GENERATED',
    key: string | null,
    payload: Record<string, unknown> | null,
  ) {
    return this.prisma.adaptiveEvent.create({
      data: {
        userId,
        courseId,
        type,
        key,
        payload: (payload ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  // ───────────────────────── teacher view ─────────────────────────

  private async students(courseId: number) {
    return this.prisma.enrollment.findMany({
      where: { courseId, status: { in: ['ACTIVE', 'COMPLETED'] } },
      orderBy: { enrolledAt: 'asc' },
      select: {
        userId: true,
        adaptiveGroup: true,
        enrolledAt: true,
        completedAt: true,
        user: {
          select: {
            email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
  }

  /**
   * Whether a shown recommendation was acted on within the follow window:
   * lesson completed, test attempted or assignment handed in.
   */
  private async followStats(courseId: number) {
    const events = await this.prisma.adaptiveEvent.findMany({
      where: {
        courseId,
        type: { in: ['RECOMMENDATION_SHOWN', 'RECOMMENDATION_OPENED'] },
      },
      orderBy: { createdAt: 'asc' },
      select: { userId: true, type: true, key: true, createdAt: true },
    });
    const firstShown = new Map<string, Date>();
    const opened = new Set<string>();
    for (const e of events) {
      const k = `${e.userId}|${e.key}`;
      if (e.type === 'RECOMMENDATION_SHOWN' && !firstShown.has(k))
        firstShown.set(k, e.createdAt);
      if (e.type === 'RECOMMENDATION_OPENED') opened.add(k);
    }
    const userIds = [...new Set(events.map((e) => e.userId))];
    const [lessons, attempts, subs] = await Promise.all([
      this.prisma.lessonProgress.findMany({
        where: {
          userId: { in: userIds },
          status: 'COMPLETED',
          lesson: { section: { courseId } },
        },
        select: { userId: true, lessonId: true, completedAt: true },
      }),
      this.prisma.testResult.findMany({
        where: {
          userId: { in: userIds },
          test: { lesson: { section: { courseId } } },
        },
        select: { userId: true, testId: true, startedAt: true },
      }),
      this.prisma.submission.findMany({
        where: {
          userId: { in: userIds },
          assignment: { lesson: { section: { courseId } } },
        },
        select: { userId: true, assignmentId: true, submittedAt: true },
      }),
    ]);
    const actedAt = (userId: number, key: string): Date[] => {
      const [type, raw] = key.split(':');
      const id = Number(raw);
      if (type === 'RETRY_TEST' || type === 'CHALLENGE')
        return attempts
          .filter((a) => a.userId === userId && a.testId === id)
          .map((a) => a.startedAt);
      if (type === 'DEADLINE')
        return subs
          .filter((s) => s.userId === userId && s.assignmentId === id)
          .map((s) => s.submittedAt);
      if (type === 'SKIP_AHEAD') return []; // section-level advice: counted when opened
      return lessons
        .filter(
          (l) => l.userId === userId && l.lessonId === id && l.completedAt,
        )
        .map((l) => l.completedAt!);
    };
    const perUser = new Map<
      number,
      { shown: number; opened: number; followed: number }
    >();
    const byType = new Map<
      string,
      { shown: number; opened: number; followed: number }
    >();
    for (const [k, shownAt] of firstShown) {
      const [uid, key] = k.split('|');
      const userId = Number(uid);
      const type = key.split(':')[0];
      const followed =
        (key.startsWith('SKIP_AHEAD') && opened.has(k)) ||
        actedAt(userId, key).some(
          (d) =>
            d >= shownAt && d.getTime() - shownAt.getTime() <= FOLLOW_WINDOW_MS,
        );
      for (const [map, id] of [
        [perUser, userId],
        [byType, type],
      ] as const) {
        const cur = (
          map as Map<
            number | string,
            { shown: number; opened: number; followed: number }
          >
        ).get(id) ?? { shown: 0, opened: 0, followed: 0 };
        cur.shown++;
        if (opened.has(k)) cur.opened++;
        if (followed) cur.followed++;
        (map as Map<number | string, typeof cur>).set(id, cur);
      }
    }
    return { perUser, byType };
  }

  async overview(courseId: number, user: AuthUser) {
    await assertCourseRole(this.prisma, courseId, user, 'view');
    const settings = await this.settings(courseId);
    const t = this.thresholds(settings);
    const [sections, students, mastery, abilities, follow] = await Promise.all([
      this.prisma.section.findMany({
        where: { courseId },
        orderBy: { order: 'asc' },
        select: { id: true, title: true },
      }),
      this.students(courseId),
      this.prisma.learnerSectionMastery.findMany({ where: { courseId } }),
      this.prisma.learnerAbility.findMany({ where: { courseId } }),
      this.followStats(courseId),
    ]);
    const m = new Map(mastery.map((r) => [`${r.userId}:${r.sectionId}`, r]));
    const theta = new Map(abilities.map((a) => [a.userId, a]));
    const rows = students.map((s) => {
      const cells = sections.map((sec) => {
        const r = m.get(`${s.userId}:${sec.id}`);
        const st = r
          ? { mastery: r.mastery, evidence: r.evidence }
          : priorMastery();
        return {
          sectionId: sec.id,
          mastery: round3(st.mastery),
          evidence: st.evidence,
          level: masteryLevel(st, t),
        };
      });
      const known = cells.filter((c) => c.evidence > 0);
      return {
        userId: s.userId,
        name: displayName(s.user),
        email: s.user.email,
        group: settings.experimentMode === 'AB_TEST' ? s.adaptiveGroup : null,
        theta: theta.has(s.userId) ? round3(theta.get(s.userId)!.theta) : null,
        meanMastery: known.length
          ? round3(known.reduce((a, c) => a + c.mastery, 0) / known.length)
          : null,
        weakSections: cells.filter((c) => c.level === 'weak').length,
        cells,
        recommendations: follow.perUser.get(s.userId) ?? {
          shown: 0,
          opened: 0,
          followed: 0,
        },
      };
    });
    const sectionStats = sections.map((sec, i) => {
      const cells = rows.map((r) => r.cells[i]).filter((c) => c.evidence > 0);
      return {
        id: sec.id,
        title: sec.title,
        meanMastery: cells.length
          ? round3(cells.reduce((a, c) => a + c.mastery, 0) / cells.length)
          : null,
        weak: cells.filter((c) => c.level === 'weak').length,
        mastered: cells.filter((c) => c.level === 'mastered').length,
      };
    });
    const groups = { ADAPTIVE: 0, CONTROL: 0 };
    for (const r of rows) if (r.group) groups[r.group]++;
    const totals = { shown: 0, opened: 0, followed: 0 };
    for (const v of follow.perUser.values()) {
      totals.shown += v.shown;
      totals.opened += v.opened;
      totals.followed += v.followed;
    }
    return {
      settings,
      sections: sectionStats,
      students: rows,
      groups,
      recommendations: {
        ...totals,
        byType: Object.fromEntries(follow.byType),
      },
    };
  }

  /** Per-student outcomes for the A/B experiment (CSV, task 9). */
  async experimentCsv(courseId: number, user: AuthUser): Promise<string> {
    const ov = await this.overview(courseId, user);
    const tests = await this.prisma.test.findMany({
      where: { lesson: { section: { courseId } } },
      orderBy: [
        { lesson: { section: { order: 'asc' } } },
        { lesson: { order: 'asc' } },
      ],
      select: { id: true },
    });
    const ids = tests.map((t) => t.id);
    const results = await this.prisma.testResult.findMany({
      where: {
        testId: { in: ids },
        finishedAt: { not: null },
        score: { not: null },
      },
      orderBy: { finishedAt: 'asc' },
      select: { userId: true, testId: true, score: true, strategy: true },
    });
    const students = await this.students(courseId);
    const enrolled = new Map(students.map((s) => [s.userId, s]));
    const lessons = await this.prisma.lesson.count({
      where: { section: { courseId } },
    });
    const done = await this.prisma.lessonProgress.groupBy({
      by: ['userId'],
      where: { status: 'COMPLETED', lesson: { section: { courseId } } },
      _count: { _all: true },
    });
    const doneBy = new Map(done.map((d) => [d.userId, d._count._all]));
    const head = [
      'student',
      'group',
      'pre_score',
      'post_score',
      'gain',
      'avg_last_score',
      'tests_taken',
      'adaptive_attempts',
      'mean_mastery',
      'weak_sections',
      'theta',
      'lessons_completed_pct',
      'days_to_complete',
      'rec_shown',
      'rec_opened',
      'rec_followed',
    ];
    const lines = [head.join(',')];
    ov.students.forEach((s, i) => {
      const mine = results.filter((r) => r.userId === s.userId);
      // pre: first attempt of the first test taken; post: last attempt of the last test taken.
      const firstTest = ids.find((id) => mine.some((r) => r.testId === id));
      const lastTest = [...ids]
        .reverse()
        .find((id) => mine.some((r) => r.testId === id));
      const pre =
        firstTest !== undefined
          ? mine.find((r) => r.testId === firstTest)!.score
          : null;
      const post =
        lastTest !== undefined
          ? [...mine].reverse().find((r) => r.testId === lastTest)!.score
          : null;
      const lastPerTest = new Map<number, number>();
      for (const r of mine) lastPerTest.set(r.testId, r.score!);
      const avg = lastPerTest.size
        ? [...lastPerTest.values()].reduce((a, b) => a + b, 0) /
          lastPerTest.size
        : null;
      const e = enrolled.get(s.userId);
      const days = e?.completedAt
        ? (e.completedAt.getTime() - e.enrolledAt.getTime()) / 86_400_000
        : null;
      const cells = [
        `S${String(i + 1).padStart(2, '0')}`,
        s.group ?? '',
        pre ?? '',
        post ?? '',
        pre !== null && post !== null ? post - pre : '',
        avg !== null ? avg.toFixed(1) : '',
        lastPerTest.size,
        mine.filter((r) => r.strategy === 'ADAPTIVE').length,
        s.meanMastery ?? '',
        s.weakSections,
        s.theta ?? '',
        lessons
          ? ((100 * (doneBy.get(s.userId) ?? 0)) / lessons).toFixed(1)
          : '',
        days !== null ? days.toFixed(1) : '',
        s.recommendations.shown,
        s.recommendations.opened,
        s.recommendations.followed,
      ];
      lines.push(cells.join(','));
    });
    return '﻿' + lines.join('\r\n') + '\r\n';
  }
}

function round3(v: number) {
  return Math.round(v * 1000) / 1000;
}
