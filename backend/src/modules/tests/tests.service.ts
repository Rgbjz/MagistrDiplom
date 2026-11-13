import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { displayName } from '../../common/utils/names';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { msg } from '../../common/i18n';
import {
  assertCourseRole,
  assertRoleOnCourse,
  can,
  courseStaffIds,
  getCourseRole,
  type CoursePermission,
} from '../../common/access/course-access';
import {
  CHOICE_TYPES,
  correctSolution,
  defaultConfig,
  describeResponse,
  isPlayable,
  normalizeConfig,
  parseResponse,
  questionProblem,
  percent,
  round2,
  scoreQuestion,
  studentView,
  type QType,
  type QuestionLike,
} from './question-types';
import { drawAttempt, type Rng } from './draw';
import { AdaptiveService } from '../adaptive/adaptive.service';

export interface TestSettingsInput {
  title?: string;
  timeLimit?: number;
  passingScore?: number;
  shuffleQuestions?: boolean;
  shuffleAnswers?: boolean;
  maxAttempts?: number | null;
  questionsPerAttempt?: number | null;
  showCorrectAnswers?: 'NEVER' | 'AFTER_SUBMIT' | 'AFTER_PASS' | 'AFTER_CLOSE';
  /** Adaptive question selection; null = course default. */
  adaptive?: boolean | null;
}

export interface QuestionInput {
  text?: string;
  type?: QType;
  difficulty?: number;
  points?: number;
  partialCredit?: boolean;
  config?: Record<string, unknown> | null;
}

const courseOwner = {
  lesson: {
    select: {
      section: {
        select: { course: { select: { id: true, teacherId: true } } },
      },
    },
  },
} as const;

const questionInclude = {
  answers: { orderBy: { id: 'asc' } },
} as const;

type QuestionRow = Prisma.QuestionGetPayload<{
  include: typeof questionInclude;
}>;

const asLike = (q: QuestionRow): QuestionLike => ({
  id: q.id,
  type: q.type,
  text: q.text,
  points: q.points,
  partialCredit: q.partialCredit,
  config: q.config,
  answers: q.answers,
});

/** Staff view of a question (includes the key). */
function staffQuestion(q: QuestionRow) {
  return {
    id: q.id,
    testId: q.testId,
    categoryId: q.categoryId,
    text: q.text,
    type: q.type,
    difficulty: q.difficulty,
    points: q.points,
    partialCredit: q.partialCredit,
    config: q.config ?? defaultConfig(q.type),
    answers: q.answers,
    // Why students can't get this question yet (null when it's complete).
    problem: questionProblem(asLike(q)),
  };
}

@Injectable()
export class TestsService {
  /** Overridable in unit tests for a deterministic draw. */
  rng: Rng = Math.random;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    @Optional() private adaptive?: AdaptiveService,
  ) {}

  // ===== ACCESS =====

  private async testCourse(testId: number) {
    const test = await this.prisma.test.findUnique({
      where: { id: testId },
      select: courseOwner,
    });
    if (!test) throw new NotFoundException('Test not found');
    return test.lesson.section.course;
  }

  private async assertTestOwner(
    testId: number,
    user: AuthUser,
    permission: CoursePermission = 'content',
  ) {
    const course = await this.testCourse(testId);
    await assertRoleOnCourse(this.prisma, course, user, permission);
    return course;
  }

  /** Course of a test question or of a bank question. */
  private async questionCourse(questionId: number) {
    const q = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: {
        test: { select: courseOwner },
        category: {
          select: { course: { select: { id: true, teacherId: true } } },
        },
      },
    });
    if (!q) throw new NotFoundException('Question not found');
    const course = q.test?.lesson.section.course ?? q.category?.course;
    if (!course) throw new NotFoundException('Question not found');
    return course;
  }

  private async assertQuestionOwner(questionId: number, user: AuthUser) {
    const course = await this.questionCourse(questionId);
    await assertRoleOnCourse(this.prisma, course, user, 'content');
  }

  private async assertAnswerOwner(answerId: number, user: AuthUser) {
    const answer = await this.prisma.answer.findUnique({
      where: { id: answerId },
      select: { questionId: true },
    });
    if (!answer) throw new NotFoundException('Answer not found');
    await this.assertQuestionOwner(answer.questionId, user);
  }

  private async assertStudentEnrolled(testId: number, userId: number) {
    const course = await this.testCourse(testId);
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, courseId: course.id, status: 'ACTIVE' },
    });
    if (!enrollment) {
      throw new ForbiddenException('You are not enrolled in this course');
    }
    return course;
  }

  // ===== TESTS =====

  private loadTest(id: number) {
    return this.prisma.test.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { id: 'asc' }, include: questionInclude },
        randomRules: {
          orderBy: { id: 'asc' },
          include: {
            category: {
              select: {
                id: true,
                name: true,
                questions: { include: questionInclude },
              },
            },
          },
        },
      },
    });
  }

  /** Questions an attempt will contain (playable own subset + bank rules). */
  private expectedCount(
    test: NonNullable<Awaited<ReturnType<TestsService['loadTest']>>>,
  ) {
    const own = test.questions.map(asLike).filter(isPlayable).length;
    const ownCount =
      test.questionsPerAttempt && test.questionsPerAttempt < own
        ? test.questionsPerAttempt
        : own;
    const bank = test.randomRules.reduce(
      (sum, r) =>
        sum +
        Math.min(
          r.count,
          r.category.questions.map(asLike).filter(isPlayable).length,
        ),
      0,
    );
    return ownCount + bank;
  }

  async getById(id: number, user: AuthUser) {
    const test = await this.loadTest(id);
    if (!test) throw new NotFoundException('Test not found');
    const course = await this.testCourse(id);
    const role = await getCourseRole(this.prisma, course.id, user);
    const settings = {
      id: test.id,
      lessonId: test.lessonId,
      title: test.title,
      timeLimit: test.timeLimit,
      passingScore: test.passingScore,
      shuffleQuestions: test.shuffleQuestions,
      shuffleAnswers: test.shuffleAnswers,
      maxAttempts: test.maxAttempts,
      questionsPerAttempt: test.questionsPerAttempt,
      showCorrectAnswers: test.showCorrectAnswers,
      adaptive: test.adaptive,
      questionCount: this.expectedCount(test),
    };
    if (can(role, 'view')) {
      return {
        ...settings,
        courseId: course.id,
        questions: test.questions.map(staffQuestion),
        randomRules: test.randomRules.map((r) => ({
          id: r.id,
          categoryId: r.categoryId,
          categoryName: r.category.name,
          count: r.count,
          available: r.category.questions.map(asLike).filter(isPlayable).length,
        })),
      };
    }
    // Students never receive question content or the key here — only what the
    // intro screen needs. Questions arrive with the attempt (POST /start).
    const attemptsUsed = await this.prisma.testResult.count({
      where: { testId: id, userId: user.id },
    });
    return {
      ...settings,
      questions: [],
      randomRules: [],
      attemptsUsed,
      attemptsLeft:
        test.maxAttempts === null
          ? null
          : Math.max(0, test.maxAttempts - attemptsUsed),
    };
  }

  async createTest(lessonId: number, data: TestSettingsInput, user: AuthUser) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { test: true, section: { include: { course: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await assertRoleOnCourse(
      this.prisma,
      lesson.section.course,
      user,
      'content',
    );
    if (lesson.test) {
      throw new BadRequestException('Test already exists for this lesson');
    }
    return this.prisma.test.create({
      data: {
        lessonId,
        title: data.title ?? 'Test',
        timeLimit: data.timeLimit ?? 10,
        passingScore: data.passingScore ?? 60,
      },
    });
  }

  async update(id: number, data: TestSettingsInput, user: AuthUser) {
    await this.assertTestOwner(id, user);
    const patch: Prisma.TestUpdateInput = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.timeLimit !== undefined)
      patch.timeLimit = Math.max(1, data.timeLimit);
    if (data.passingScore !== undefined)
      patch.passingScore = Math.min(100, Math.max(0, data.passingScore));
    if (data.shuffleQuestions !== undefined)
      patch.shuffleQuestions = data.shuffleQuestions;
    if (data.shuffleAnswers !== undefined)
      patch.shuffleAnswers = data.shuffleAnswers;
    if (data.maxAttempts !== undefined)
      patch.maxAttempts =
        data.maxAttempts && data.maxAttempts > 0 ? data.maxAttempts : null;
    if (data.questionsPerAttempt !== undefined)
      patch.questionsPerAttempt =
        data.questionsPerAttempt && data.questionsPerAttempt > 0
          ? data.questionsPerAttempt
          : null;
    if (data.showCorrectAnswers !== undefined)
      patch.showCorrectAnswers = data.showCorrectAnswers;
    if (data.adaptive !== undefined) patch.adaptive = data.adaptive;
    return this.prisma.test.update({ where: { id }, data: patch });
  }

  async deleteTest(id: number, user: AuthUser) {
    await this.assertTestOwner(id, user);
    await this.prisma.test.delete({ where: { id } });
  }

  // ===== QUESTIONS =====

  /** Shared by test questions and bank questions. */
  questionData(data: QuestionInput, typeFallback: QType = 'SINGLE') {
    const type = data.type ?? typeFallback;
    const points = data.points ?? 1;
    if (!Number.isInteger(points) || points < 1 || points > 100) {
      throw new BadRequestException('Points must be 1..100');
    }
    return {
      text: data.text ?? '',
      type,
      difficulty: data.difficulty ?? 1,
      points,
      partialCredit: !!data.partialCredit,
      config: (data.config === undefined
        ? defaultConfig(type)
        : normalizeConfig(type, data.config)) as Prisma.InputJsonValue,
    };
  }

  async createQuestion(testId: number, data: QuestionInput, user: AuthUser) {
    await this.assertTestOwner(testId, user);
    const q = await this.prisma.question.create({
      data: { testId, ...this.questionData(data) },
      include: questionInclude,
    });
    return staffQuestion(q);
  }

  async updateQuestion(id: number, data: QuestionInput, user: AuthUser) {
    await this.assertQuestionOwner(id, user);
    const current = await this.prisma.question.findUniqueOrThrow({
      where: { id },
    });
    const type = data.type ?? current.type;
    const patch: Prisma.QuestionUpdateInput = {};
    if (data.text !== undefined) patch.text = data.text;
    if (data.difficulty !== undefined) patch.difficulty = data.difficulty;
    if (data.points !== undefined) {
      if (
        !Number.isInteger(data.points) ||
        data.points < 1 ||
        data.points > 100
      )
        throw new BadRequestException('Points must be 1..100');
      patch.points = data.points;
    }
    if (data.partialCredit !== undefined)
      patch.partialCredit = data.partialCredit;
    if (data.type !== undefined && data.type !== current.type) {
      patch.type = type;
      // A new type starts from its default settings unless new ones are sent.
      patch.config = (
        data.config !== undefined
          ? normalizeConfig(type, data.config)
          : defaultConfig(type)
      ) as Prisma.InputJsonValue;
    } else if (data.config !== undefined) {
      patch.config = normalizeConfig(
        type,
        data.config,
      ) as Prisma.InputJsonValue;
    }
    const q = await this.prisma.question.update({
      where: { id },
      data: patch,
      include: questionInclude,
    });
    return staffQuestion(q);
  }

  async deleteQuestion(id: number, user: AuthUser) {
    await this.assertQuestionOwner(id, user);
    await this.prisma.question.delete({ where: { id } });
  }

  // ===== ANSWERS (SINGLE / MULTIPLE options) =====

  async createAnswer(
    questionId: number,
    data: { text: string; isCorrect?: boolean },
    user: AuthUser,
  ) {
    await this.assertQuestionOwner(questionId, user);
    return this.prisma.answer.create({
      data: { questionId, text: data.text, isCorrect: !!data.isCorrect },
    });
  }

  async updateAnswer(
    id: number,
    data: { text?: string; isCorrect?: boolean },
    user: AuthUser,
  ) {
    await this.assertAnswerOwner(id, user);
    return this.prisma.answer.update({ where: { id }, data });
  }

  async deleteAnswer(id: number, user: AuthUser) {
    await this.assertAnswerOwner(id, user);
    await this.prisma.answer.delete({ where: { id } });
  }

  // ===== RESULTS (staff) =====

  async getTestResults(testId: number, user: AuthUser) {
    await this.assertTestOwner(testId, user, 'view');
    const results = await this.prisma.testResult.findMany({
      where: { testId, finishedAt: { not: null } },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: [{ userId: 'asc' }, { attempt: 'desc' }],
    });

    const lastResults = new Map<number, (typeof results)[number]>();
    for (const r of results) {
      if (!lastResults.has(r.userId)) lastResults.set(r.userId, r);
    }

    return Array.from(lastResults.values()).map((r) => ({
      userId: r.user.id,
      userName: displayName(r.user),
      email: r.user.email,
      attempt: r.attempt,
      score: r.score,
      passed: r.passed,
      pendingReview: r.pendingReview,
      finishedAt: r.finishedAt,
    }));
  }

  // ===== RESULTS (student) =====

  /** Whether the result page may reveal the answer key (see ShowAnswersMode). */
  private async mayShowKey(
    test: {
      id: number;
      showCorrectAnswers: string;
      maxAttempts: number | null;
    },
    userId: number,
  ): Promise<boolean> {
    switch (test.showCorrectAnswers) {
      case 'NEVER':
        return false;
      case 'AFTER_PASS':
        return (
          (await this.prisma.testResult.count({
            where: { testId: test.id, userId, passed: true },
          })) > 0
        );
      case 'AFTER_CLOSE': {
        // No close date exists for tests: "closed" = all attempts used.
        if (test.maxAttempts === null) return false;
        const used = await this.prisma.testResult.count({
          where: { testId: test.id, userId, finishedAt: { not: null } },
        });
        return used >= test.maxAttempts;
      }
      default:
        return true;
    }
  }

  async getMyTestResult(userId: number, testId: number) {
    const result = await this.prisma.testResult.findFirst({
      where: { userId, testId, finishedAt: { not: null } },
      orderBy: { attempt: 'desc' },
      include: {
        answers: true,
        questions: {
          orderBy: { position: 'asc' },
          include: { question: { include: questionInclude } },
        },
        test: {
          include: {
            lesson: {
              select: {
                id: true,
                section: {
                  select: { course: { select: { id: true, title: true } } },
                },
              },
            },
            questions: { orderBy: { id: 'asc' }, include: questionInclude },
          },
        },
      },
    });
    if (!result) return null;

    const test = result.test;
    const showKey = await this.mayShowKey(test, userId);

    type Row = {
      question: QuestionRow;
      optionOrder: number[] | null;
      response: Record<string, unknown> | null;
      earned: number;
      maxPoints: number;
      status: string;
      feedback: string | null;
    };
    let rows: Row[];
    if (result.questions.length) {
      rows = result.questions.map((aq) => ({
        question: aq.question,
        optionOrder: (aq.optionOrder as number[] | null) ?? null,
        response: (aq.response as Record<string, unknown> | null) ?? null,
        earned: aq.earned,
        maxPoints: aq.maxPoints,
        status: aq.status,
        feedback: aq.feedback,
      }));
    } else {
      // Attempts made before per-attempt storage: SINGLE/MULTIPLE via UserAnswer.
      rows = test.questions.map((q) => {
        const ids = result.answers
          .filter((a) => a.questionId === q.id)
          .map((a) => a.answerId);
        const response = ids.length ? { answerIds: ids } : null;
        return {
          question: q,
          optionOrder: null,
          response,
          earned: scoreQuestion(asLike(q), response).earned,
          maxPoints: q.points,
          status: 'AUTO',
          feedback: null,
        };
      });
    }

    const details = rows.map((r) => {
      const like = asLike(r.question);
      const view = studentView(like, r.optionOrder);
      const solution = showKey ? correctSolution(like) : null;
      const userAnswerIds =
        (r.response?.answerIds as number[] | undefined) ?? [];
      return {
        questionId: r.question.id,
        text: r.question.text,
        type: r.question.type,
        points: r.maxPoints,
        earned: round2(r.earned),
        status: r.status,
        feedback: r.feedback,
        isCorrect: r.status !== 'PENDING' && r.earned >= r.maxPoints - 1e-9,
        answers: view.answers ?? [],
        userAnswerIds,
        correctAnswerIds: (solution?.answerIds as number[] | undefined) ?? [],
        response: describeResponse(like, r.response),
        correct: solution,
      };
    });
    const course = test.lesson.section.course;
    const earned = round2(rows.reduce((s, r) => s + r.earned, 0));
    const total = rows.reduce((s, r) => s + r.maxPoints, 0);

    return {
      id: result.id,
      score: result.score,
      passed: result.passed,
      pendingReview: result.pendingReview,
      showCorrectAnswers: showKey,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      attempt: result.attempt,
      correct: details.filter((d) => d.isCorrect).length,
      total: details.length,
      earnedPoints: earned,
      totalPoints: total,
      passingScore: test.passingScore,
      timeLimit: test.timeLimit,
      maxAttempts: test.maxAttempts,
      testId: test.id,
      testTitle: test.title,
      courseId: course.id,
      courseTitle: course.title,
      lessonId: test.lesson.id,
      details,
    };
  }

  /**
   * Adaptive attempt: the pool is the test's playable questions plus its
   * bank categories; the module picks as many as a usual attempt has.
   */
  private async adaptivePlan(
    test: NonNullable<Awaited<ReturnType<TestsService['loadTest']>>>,
    userId: number,
  ): Promise<{ questions: QuestionLike[]; target: number } | null> {
    if (!this.adaptive) return null;
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: test.lessonId },
      select: { sectionId: true, section: { select: { courseId: true } } },
    });
    if (!lesson) return null;
    const rows = [
      ...test.questions,
      ...test.randomRules.flatMap((r) => r.category.questions),
    ];
    const byId = new Map<number, (typeof rows)[number]>();
    for (const q of rows) if (isPlayable(asLike(q))) byId.set(q.id, q);
    const plan = await this.adaptive.planAttempt({
      userId,
      testId: test.id,
      testAdaptive: test.adaptive,
      courseId: lesson.section.courseId,
      sectionId: lesson.sectionId,
      pool: [...byId.values()].map((q) => ({
        id: q.id,
        difficulty: q.difficulty,
        calibratedDifficulty: q.calibratedDifficulty,
      })),
      count: this.expectedCount(test),
    });
    if (!plan || !plan.ids.length) return null;
    return {
      questions: plan.ids.map((id) => asLike(byId.get(id)!)),
      target: plan.target,
    };
  }

  getMyAttempts(userId: number, testId: number) {
    return this.prisma.testResult.findMany({
      where: { userId, testId },
      orderBy: { attempt: 'desc' },
      select: {
        id: true,
        attempt: true,
        score: true,
        passed: true,
        pendingReview: true,
        startedAt: true,
        finishedAt: true,
      },
    });
  }

  // ===== TAKING A TEST =====

  async startTest(testId: number, userId: number) {
    await this.assertStudentEnrolled(testId, userId);
    const test = await this.loadTest(testId);
    if (!test) throw new NotFoundException('Test not found');

    const attempts = await this.prisma.testResult.count({
      where: { testId, userId },
    });
    if (test.maxAttempts !== null && attempts >= test.maxAttempts) {
      throw new BadRequestException('No attempts left');
    }

    // Adaptation module: questions matched to the student's ability, or
    // the usual draw (control group, adaptive tests off).
    const plan = await this.adaptivePlan(test, userId);
    const drawn = plan
      ? drawAttempt(
          plan.questions,
          [],
          {
            shuffleQuestions: test.shuffleQuestions,
            shuffleAnswers: test.shuffleAnswers,
            questionsPerAttempt: null,
          },
          this.rng,
        )
      : drawAttempt(
          test.questions.map(asLike),
          test.randomRules.map((r) => ({
            count: r.count,
            questions: r.category.questions.map(asLike),
          })),
          {
            shuffleQuestions: test.shuffleQuestions,
            shuffleAnswers: test.shuffleAnswers,
            questionsPerAttempt: test.questionsPerAttempt,
          },
          this.rng,
        );
    if (drawn.length === 0) {
      throw new BadRequestException('Test has no questions');
    }

    const testResult = await this.prisma.testResult.create({
      data: {
        testId,
        userId,
        attempt: attempts + 1,
        startedAt: new Date(),
        strategy: plan ? 'ADAPTIVE' : 'FIXED',
        targetDifficulty: plan?.target ?? null,
        questions: {
          create: drawn.map((d) => ({
            questionId: d.question.id,
            position: d.position,
            optionOrder: d.optionOrder ?? undefined,
            maxPoints: d.question.points,
          })),
        },
      },
    });

    return {
      testResultId: testResult.id,
      attempt: testResult.attempt,
      timeLimit: test.timeLimit,
      startedAt: testResult.startedAt,
      questions: drawn.map((d) => studentView(d.question, d.optionOrder)),
    };
  }

  async submitTest(
    testResultId: number,
    userId: number,
    answers: Record<string, unknown>,
  ) {
    const testResult = await this.prisma.testResult.findUnique({
      where: { id: testResultId },
      include: {
        questions: {
          orderBy: { position: 'asc' },
          include: { question: { include: questionInclude } },
        },
        test: {
          include: {
            questions: { orderBy: { id: 'asc' }, include: questionInclude },
            lesson: {
              select: {
                section: {
                  select: {
                    course: {
                      select: { id: true, title: true, teacherId: true },
                    },
                  },
                },
              },
            },
          },
        },
        user: {
          select: {
            email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!testResult) throw new NotFoundException('Test result not found');
    if (testResult.userId !== userId)
      throw new ForbiddenException('Access denied');
    if (testResult.finishedAt)
      throw new BadRequestException('Test already submitted');

    // Attempts started before per-attempt storage have no rows: use the test's questions.
    const legacy = testResult.questions.length === 0;
    const items = legacy
      ? testResult.test.questions.map((q, position) => ({
          id: null as number | null,
          question: q,
          maxPoints: q.points,
          position,
        }))
      : testResult.questions.map((aq) => ({
          id: aq.id,
          question: aq.question,
          maxPoints: aq.maxPoints,
          position: aq.position,
        }));
    if (items.length === 0)
      throw new BadRequestException('Test has no questions');

    const byQuestion = new Map(items.map((it) => [it.question.id, it]));
    const parsed = new Map<number, Record<string, unknown> | null>();
    for (const [key, value] of Object.entries(answers ?? {})) {
      const it = byQuestion.get(Number(key));
      if (!it) throw new BadRequestException(`Unknown question ${key}`);
      parsed.set(it.question.id, parseResponse(asLike(it.question), value));
    }

    const deadline = new Date(testResult.startedAt);
    deadline.setMinutes(deadline.getMinutes() + testResult.test.timeLimit);
    const finishedAt = new Date();
    if (finishedAt > deadline) finishedAt.setTime(deadline.getTime());

    let earned = 0;
    let total = 0;
    let correct = 0;
    let pending = false;
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    for (const it of items) {
      const response = parsed.get(it.question.id) ?? null;
      // Points are scaled to the attempt's stored maximum.
      const like = { ...asLike(it.question), points: it.maxPoints };
      const scored = scoreQuestion(like, response);
      earned += scored.earned;
      total += it.maxPoints;
      if (scored.status === 'PENDING') pending = true;
      else if (scored.earned >= it.maxPoints - 1e-9) correct++;
      const data = {
        response: (response ?? undefined) as Prisma.InputJsonValue | undefined,
        earned: scored.earned,
        status: scored.status,
      };
      writes.push(
        it.id
          ? this.prisma.attemptQuestion.update({ where: { id: it.id }, data })
          : this.prisma.attemptQuestion.create({
              data: {
                ...data,
                testResultId,
                questionId: it.question.id,
                position: it.position,
                maxPoints: it.maxPoints,
              },
            }),
      );
    }

    const score = percent(earned, total);
    const passed = pending ? null : score >= testResult.test.passingScore;

    await this.prisma.$transaction([
      ...writes,
      this.prisma.testResult.update({
        where: { id: testResultId },
        data: { finishedAt, score, passed, pendingReview: pending },
      }),
    ]);
    await this.adaptive?.onTestSubmitted(testResultId);

    const course = testResult.test.lesson.section.course;
    const link = `/courses/${course.id}/tests/${testResult.testId}/result`;
    await this.notifications.notify(userId, {
      type: 'TEST_RESULT',
      title: pending
        ? msg('notify.testPending.title', { test: testResult.test.title })
        : msg(passed ? 'notify.testPassed.title' : 'notify.testFailed.title', {
            test: testResult.test.title,
            score,
          }),
      body: msg('notify.courseBody', { course: course.title }),
      link,
    });
    if (pending) {
      const staff = await courseStaffIds(this.prisma, course, [
        'OWNER',
        'TEACHER',
        'ASSISTANT',
      ]);
      await this.notifications.notifyMany(staff, {
        type: 'TEST_RESULT',
        title: msg('notify.testReviewRequest.title', {
          student: displayName(testResult.user),
          test: testResult.test.title,
        }),
        body: msg('notify.courseBody', { course: course.title }),
        link: `/courses/${course.id}/manage?tab=tests`,
      });
    }

    return {
      score,
      passed,
      pendingReview: pending,
      correct,
      total: items.length,
      finishedAt,
    };
  }

  // ===== ESSAY REVIEW =====

  async listPendingReviews(courseId: number, user: AuthUser) {
    await assertCourseRole(this.prisma, courseId, user, 'grade');
    const rows = await this.prisma.attemptQuestion.findMany({
      where: {
        status: 'PENDING',
        testResult: {
          finishedAt: { not: null },
          test: { lesson: { section: { courseId } } },
        },
      },
      orderBy: { testResult: { finishedAt: 'asc' } },
      include: {
        question: { select: { id: true, text: true, config: true } },
        testResult: {
          select: {
            id: true,
            attempt: true,
            finishedAt: true,
            test: { select: { id: true, title: true } },
            user: {
              select: {
                id: true,
                email: true,
                profile: {
                  select: { firstName: true, lastName: true, avatarUrl: true },
                },
              },
            },
          },
        },
      },
    });
    return rows.map((r) => {
      const cfg = (r.question.config ?? {}) as {
        rubric?: string;
        maxWords?: number | null;
      };
      return {
        id: r.id,
        testId: r.testResult.test.id,
        testTitle: r.testResult.test.title,
        attempt: r.testResult.attempt,
        submittedAt: r.testResult.finishedAt,
        student: {
          id: r.testResult.user.id,
          name: displayName(r.testResult.user),
          email: r.testResult.user.email,
          avatarUrl: r.testResult.user.profile?.avatarUrl ?? null,
        },
        question: r.question.text,
        rubric: cfg.rubric || null,
        answer: (
          (r.response as { text?: string } | null)?.text ?? ''
        ).toString(),
        maxPoints: r.maxPoints,
      };
    });
  }

  async gradeEssay(
    attemptQuestionId: number,
    data: { points: number; feedback?: string },
    user: AuthUser,
  ) {
    const aq = await this.prisma.attemptQuestion.findUnique({
      where: { id: attemptQuestionId },
      include: {
        question: { select: { type: true } },
        testResult: {
          include: {
            test: {
              select: {
                id: true,
                title: true,
                passingScore: true,
                lesson: {
                  select: {
                    section: {
                      select: {
                        course: {
                          select: { id: true, title: true, teacherId: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!aq) throw new NotFoundException('Answer not found');
    const course = aq.testResult.test.lesson.section.course;
    await assertRoleOnCourse(this.prisma, course, user, 'grade');
    if (aq.question.type !== 'ESSAY') {
      throw new BadRequestException('Only essay answers are graded manually');
    }
    const points = Number(data.points);
    if (!Number.isFinite(points) || points < 0 || points > aq.maxPoints) {
      throw new BadRequestException(`Points must be 0..${aq.maxPoints}`);
    }

    await this.prisma.attemptQuestion.update({
      where: { id: aq.id },
      data: {
        earned: round2(points),
        status: 'GRADED',
        feedback: data.feedback?.trim() || null,
        gradedAt: new Date(),
        gradedById: user.id,
      },
    });
    await this.adaptive?.onEssayGraded(aq.id);

    const all = await this.prisma.attemptQuestion.findMany({
      where: { testResultId: aq.testResultId },
      select: { earned: true, maxPoints: true, status: true },
    });
    const earned = all.reduce((s, r) => s + r.earned, 0);
    const total = all.reduce((s, r) => s + r.maxPoints, 0);
    const stillPending = all.some((r) => r.status === 'PENDING');
    const score = percent(earned, total);
    const test = aq.testResult.test;
    const passed = stillPending ? null : score >= test.passingScore;
    const updated = await this.prisma.testResult.update({
      where: { id: aq.testResultId },
      data: { score, passed, pendingReview: stillPending },
    });

    if (!stillPending) {
      await this.notifications.notify(aq.testResult.userId, {
        type: 'TEST_RESULT',
        title: msg('notify.testReviewed.title', { test: test.title, score }),
        body: msg('notify.courseBody', { course: course.title }),
        link: `/courses/${course.id}/tests/${test.id}/result`,
      });
    }
    return {
      testResultId: updated.id,
      score: updated.score,
      passed: updated.passed,
      pendingReview: updated.pendingReview,
    };
  }

  /** Bank question copies and choice-type checks shared with QuestionBankService. */
  isChoice(type: string) {
    return CHOICE_TYPES.includes(type as QType);
  }
}
