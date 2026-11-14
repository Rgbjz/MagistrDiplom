import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { GradebookService } from '../gradebook/gradebook.service';
import {
  assignmentStats,
  choiceCorrect,
  gradeDistribution,
  hardQuestionsFromTally,
  latest,
  riskFlags,
  tallyOutcomes,
  testStats,
  weeklyActivity,
  type ActivityKind,
  type QuestionMeta,
  type QuestionOutcome,
  type QuestionTally,
  type RiskFlag,
} from './analytics.compute';

const GRADED_STATUSES = ['ACTIVE', 'COMPLETED'] as const;
const WEEK = 7 * 24 * 60 * 60 * 1000;

export interface AtRiskStudent {
  userId: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  progress: number;
  final: number | null;
  scaleCode: string | null;
  lastActivity: Date | null;
  overdue: number;
  flags: RiskFlag[];
}

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private gradebook: GradebookService,
  ) {}

  /** Everything the course analytics page shows, in one payload (course team only). */
  async courseAnalytics(courseId: number, user: AuthUser, now = new Date()) {
    // The gradebook checks the 'view' permission (team or admin, else 403)
    // and gives weighted finals and progress per student.
    const gb = await this.gradebook.gradebook(courseId, user);
    const rows = gb.rows;
    const userIds = rows.map((r) => r.userId);

    const lessons = await this.prisma.lesson.findMany({
      where: { section: { courseId } },
      orderBy: [{ section: { order: 'asc' } }, { order: 'asc' }],
      select: {
        id: true,
        test: {
          select: {
            id: true,
            title: true,
            questions: {
              select: {
                id: true,
                text: true,
                type: true,
                answers: { select: { id: true, isCorrect: true } },
              },
            },
          },
        },
        assignment: {
          select: { id: true, title: true, maxScore: true, dueAt: true },
        },
      },
    });
    const lessonIds = lessons.map((l) => l.id);
    const tests = lessons.flatMap((l) =>
      l.test ? [{ ...l.test, lessonId: l.id }] : [],
    );
    const assignments = lessons.flatMap((l) =>
      l.assignment ? [{ ...l.assignment, lessonId: l.id }] : [],
    );
    const testIds = tests.map((t) => t.id);
    const assignmentIds = assignments.map((a) => a.id);

    const [enrollments, results, submissions, progress, messages] =
      await Promise.all([
        this.prisma.enrollment.findMany({
          where: { courseId, status: { in: [...GRADED_STATUSES] } },
          select: { userId: true, enrolledAt: true },
        }),
        this.prisma.testResult.findMany({
          where: {
            testId: { in: testIds },
            userId: { in: userIds },
            finishedAt: { not: null },
          },
          select: {
            id: true,
            userId: true,
            testId: true,
            score: true,
            passed: true,
            finishedAt: true,
          },
        }),
        this.prisma.submission.findMany({
          where: {
            assignmentId: { in: assignmentIds },
            userId: { in: userIds },
          },
          select: {
            userId: true,
            assignmentId: true,
            status: true,
            score: true,
            submittedAt: true,
          },
        }),
        this.prisma.lessonProgress.findMany({
          where: { lessonId: { in: lessonIds }, userId: { in: userIds } },
          select: {
            userId: true,
            status: true,
            startedAt: true,
            completedAt: true,
          },
        }),
        this.prisma.message.groupBy({
          by: ['senderId'],
          where: { conversation: { courseId }, senderId: { in: userIds } },
          _max: { createdAt: true },
        }),
      ]);

    // ── question outcomes: graded per question when stored, else from chosen options
    // Per-question counters are aggregated in PostgreSQL: loading every
    // answered question of every attempt into Node grew with course size.
    const resultIds = results.map((r) => r.id);
    const [aggregated, gradedRows] = resultIds.length
      ? await Promise.all([
          this.prisma.$queryRaw<
            { questionId: number; attempts: number; correct: number }[]
          >`
            SELECT aq."questionId" AS "questionId",
                   count(*)::int AS attempts,
                   (count(*) FILTER (WHERE aq."maxPoints" > 0 AND aq.earned >= aq."maxPoints"))::int AS correct
            FROM "AttemptQuestion" aq
            WHERE aq."testResultId" = ANY(${resultIds}::int[])
              AND aq.status <> 'PENDING'
            GROUP BY aq."questionId"`,
          this.prisma.$queryRaw<{ testResultId: number }[]>`
            SELECT DISTINCT aq."testResultId" AS "testResultId"
            FROM "AttemptQuestion" aq
            WHERE aq."testResultId" = ANY(${resultIds}::int[])
              AND aq.status <> 'PENDING'`,
        ])
      : [[], []];
    const tally: QuestionTally = new Map(
      aggregated.map((a) => [
        a.questionId,
        { attempts: a.attempts, correct: a.correct },
      ]),
    );
    const graded = new Set(gradedRows.map((r) => r.testResultId));
    // Older attempts stored only the chosen options (no per-question rows).
    const legacyIds = resultIds.filter((id) => !graded.has(id));
    const userAnswers = legacyIds.length
      ? await this.prisma.userAnswer.findMany({
          where: { testResultId: { in: legacyIds } },
          select: { testResultId: true, questionId: true, answerId: true },
        })
      : [];
    const outcomes: QuestionOutcome[] = [];
    const chosen = new Map<string, number[]>();
    for (const a of userAnswers) {
      const key = `${a.testResultId}:${a.questionId}`;
      chosen.set(key, [...(chosen.get(key) ?? []), a.answerId]);
    }
    const testsById = new Map(tests.map((t) => [t.id, t]));
    for (const r of results) {
      if (graded.has(r.id)) continue;
      for (const q of testsById.get(r.testId)?.questions ?? []) {
        if (q.type !== 'SINGLE' && q.type !== 'MULTIPLE') continue;
        const picked = chosen.get(`${r.id}:${q.id}`);
        if (!picked) continue; // older attempt without this question
        outcomes.push({
          questionId: q.id,
          correct: choiceCorrect(
            picked,
            q.answers.filter((a) => a.isCorrect).map((a) => a.id),
          ),
        });
      }
    }
    const meta = new Map<number, QuestionMeta>();
    for (const t of tests) {
      for (const q of t.questions) {
        meta.set(q.id, {
          id: q.id,
          text: q.text,
          type: q.type,
          testId: t.id,
          testTitle: t.title,
          lessonId: t.lessonId,
        });
      }
    }

    // ── students: last activity, overdue labs, risk flags
    const enrolledAt = new Map(
      enrollments.map((e) => [e.userId, e.enrolledAt]),
    );
    const lastMessage = new Map(
      messages.map((m) => [m.senderId, m._max.createdAt]),
    );
    const activity = new Map<number, (Date | null)[]>();
    const push = (userId: number, d: Date | null) =>
      activity.set(userId, [...(activity.get(userId) ?? []), d]);
    progress.forEach((p) => push(p.userId, p.completedAt ?? p.startedAt));
    results.forEach((r) => push(r.userId, r.finishedAt));
    submissions.forEach((s) => push(s.userId, s.submittedAt));

    const pastDue = assignments.filter((a) => a.dueAt && a.dueAt < now);
    const handedIn = new Set(
      submissions.map((s) => `${s.userId}:${s.assignmentId}`),
    );

    const students: AtRiskStudent[] = rows.map((r) => {
      const last = latest([
        ...(activity.get(r.userId) ?? []),
        lastMessage.get(r.userId) ?? null,
      ]);
      const overdue = pastDue.filter(
        (a) => !handedIn.has(`${r.userId}:${a.id}`),
      ).length;
      return {
        userId: r.userId,
        name: r.name,
        email: r.email,
        avatarUrl: r.avatarUrl,
        progress: r.progress,
        final: r.final,
        scaleCode: r.scaleGrade?.code ?? null,
        lastActivity: last,
        overdue,
        flags: riskFlags(
          {
            enrolledAt: enrolledAt.get(r.userId) ?? now,
            progress: r.progress,
            final: r.final,
            lastActivity: last,
            overdue,
          },
          gb.course.gradePassThreshold,
          now,
        ),
      };
    });
    const atRisk = students
      .filter((s) => s.flags.length > 0)
      .sort(
        (a, b) =>
          b.flags.length - a.flags.length ||
          a.progress - b.progress ||
          a.name.localeCompare(b.name, 'uk'),
      );

    // ── weekly activity
    const events: { kind: ActivityKind; at: Date }[] = [
      ...progress
        .filter((p) => p.status === 'COMPLETED' && p.completedAt)
        .map((p) => ({ kind: 'lesson' as const, at: p.completedAt! })),
      ...results.map((r) => ({ kind: 'test' as const, at: r.finishedAt! })),
      ...submissions.map((s) => ({
        kind: 'submission' as const,
        at: s.submittedAt,
      })),
    ];

    const progresses = rows.map((r) => r.progress);
    return {
      course: {
        id: gb.course.id,
        title: gb.course.title,
        gradingScale: gb.course.gradingScale,
        gradePassThreshold: gb.course.gradePassThreshold,
      },
      summary: {
        students: rows.length,
        activeLast7Days: students.filter(
          (s) =>
            s.lastActivity && now.getTime() - s.lastActivity.getTime() <= WEEK,
        ).length,
        avgProgress: progresses.length
          ? Math.round(
              progresses.reduce((a, b) => a + b, 0) / progresses.length,
            )
          : null,
        avgFinal: gb.stats.avgFinal,
        passRate: gb.stats.passRate,
        awaitingGrading: submissions.filter((s) => s.status === 'SUBMITTED')
          .length,
        atRisk: atRisk.length,
      },
      distribution: gradeDistribution(
        rows.map((r) => r.final),
        gb.course.gradingScale,
        gb.course.scaleBands,
        gb.course.gradePassThreshold,
      ),
      hardQuestions: hardQuestionsFromTally(
        tallyOutcomes(outcomes, tally),
        meta,
      ),
      tests: testStats(
        tests.map((t) => ({ id: t.id, title: t.title, lessonId: t.lessonId })),
        results,
      ),
      assignments: assignmentStats(assignments, submissions, userIds, now),
      atRisk,
      weekly: weeklyActivity(events, now),
    };
  }
}
