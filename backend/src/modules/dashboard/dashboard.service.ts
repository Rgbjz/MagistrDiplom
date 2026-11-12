import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import { ChatService } from '../chat/chat.service';
import { displayName } from '../../common/utils/names';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { staffCourseWhere } from '../../common/access/course-access';

const WEEKDAYS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function dayKey(d: Date): string {
  // Local calendar day, so bars match what the user sees as "today".
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private progress: ProgressService,
    private chat: ChatService,
  ) {}

  async getDashboard(user: AuthUser) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: user.id },
      select: { firstName: true },
    });
    const name = profile?.firstName ?? null;
    const recentConversations = (
      await this.chat.listConversations(user.id)
    ).slice(0, 5);

    if (user.role === 'ADMIN') {
      return { role: 'ADMIN', name, recentConversations };
    }
    if (user.role === 'TEACHER') {
      return {
        role: 'TEACHER',
        name,
        ...(await this.teacherData(user.id)),
        recentConversations,
      };
    }
    return {
      role: 'STUDENT',
      name,
      ...(await this.studentData(user.id)),
      assistingCourses: await this.assistingCourses(user.id),
      recentConversations,
    };
  }

  /** Courses where a student account helps on the team (e.g. as an assistant). */
  private async assistingCourses(userId: number) {
    const rows = await this.prisma.courseStaff.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        role: true,
        course: { select: { id: true, title: true, imageUrl: true } },
      },
    });
    return rows.map((r) => ({ ...r.course, role: r.role }));
  }

  private async studentData(userId: number) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, status: 'ACTIVE' },
      orderBy: { updatedAt: 'desc' },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            imageUrl: true,
            sections: {
              orderBy: { order: 'asc' },
              select: {
                lessons: {
                  orderBy: { order: 'asc' },
                  select: {
                    id: true,
                    title: true,
                    test: {
                      select: {
                        id: true,
                        title: true,
                        timeLimit: true,
                        _count: { select: { questions: true } },
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

    let completed = 0;
    const continueLearning: {
      id: number;
      title: string;
      imageUrl: string | null;
      percent: number;
      nextLesson: { id: number; title: string } | null;
      completedLessons: number;
      totalLessons: number;
    }[] = [];
    const upcomingTests: {
      testId: number;
      title: string;
      courseId: number;
      courseTitle: string;
      questionsCount: number;
      timeLimit: number;
    }[] = [];

    for (const e of enrollments) {
      const p = await this.progress.getProgress(e.courseId, userId);
      const lessons = e.course.sections.flatMap((s) => s.lessons);
      const doneLessons = new Set(p.lessons);
      const passedTests = new Set(p.tests);

      for (const l of lessons) {
        if (
          l.test &&
          !passedTests.has(l.test.id) &&
          l.test._count.questions > 0
        ) {
          upcomingTests.push({
            testId: l.test.id,
            title: l.test.title,
            courseId: e.course.id,
            courseTitle: e.course.title,
            questionsCount: l.test._count.questions,
            timeLimit: l.test.timeLimit,
          });
        }
      }

      if (p.percent >= 100) {
        completed++;
        continue;
      }
      const next = lessons.find((l) => !doneLessons.has(l.id));
      continueLearning.push({
        id: e.course.id,
        title: e.course.title,
        imageUrl: e.course.imageUrl,
        percent: p.percent,
        nextLesson: next ? { id: next.id, title: next.title } : null,
        completedLessons: lessons.filter((l) => doneLessons.has(l.id)).length,
        totalLessons: lessons.length,
      });
    }

    const lessonsCompleted = await this.prisma.lessonProgress.count({
      where: { userId, status: 'COMPLETED' },
    });
    const passedTests = await this.prisma.testResult.findMany({
      where: { userId, passed: true },
      distinct: ['testId'],
      select: { testId: true },
    });
    const agg = await this.prisma.testResult.aggregate({
      where: { userId, finishedAt: { not: null } },
      _avg: { score: true },
    });
    const avgScore =
      agg._avg.score === null ? null : Math.round(agg._avg.score);

    return {
      stats: {
        enrolled: enrollments.length,
        completed,
        lessonsCompleted,
        testsPassed: passedTests.length,
        avgScore,
      },
      continueLearning,
      upcomingTests: upcomingTests.slice(0, 3),
      upcomingAssignments: await this.upcomingAssignments(
        userId,
        enrollments.map((e) => e.courseId),
      ),
    };
  }

  /** Not-yet-graded assignments in the student's active courses, nearest deadline first. */
  private async upcomingAssignments(userId: number, courseIds: number[]) {
    if (courseIds.length === 0) return [];
    const assignments = await this.prisma.assignment.findMany({
      where: {
        lesson: { section: { courseId: { in: courseIds } } },
        NOT: { submissions: { some: { userId, status: 'GRADED' } } },
      },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      take: 3,
      select: {
        id: true,
        title: true,
        dueAt: true,
        lesson: {
          select: {
            section: {
              select: { course: { select: { id: true, title: true } } },
            },
          },
        },
        submissions: { where: { userId }, select: { status: true } },
      },
    });
    return assignments.map((a) => ({
      assignmentId: a.id,
      title: a.title,
      courseId: a.lesson.section.course.id,
      courseTitle: a.lesson.section.course.title,
      dueAt: a.dueAt,
      status: a.submissions[0]?.status ?? null,
    }));
  }

  private async teacherData(teacherId: number) {
    const courses = await this.prisma.course.findMany({
      where: staffCourseWhere(teacherId),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        teacherId: true,
        staff: { where: { userId: teacherId }, select: { role: true } },
        title: true,
        imageUrl: true,
        published: true,
        price: true,
        enrollments: {
          select: {
            userId: true,
            status: true,
            createdAt: true,
            user: {
              select: {
                email: true,
                profile: {
                  select: { firstName: true, lastName: true, avatarUrl: true },
                },
              },
            },
          },
        },
        sections: {
          select: {
            lessons: { select: { id: true, test: { select: { id: true } } } },
          },
        },
      },
    });

    const courseIds = courses.map((c) => c.id);
    const studentIds = new Set<number>();
    const pendingRequests: {
      courseId: number;
      courseTitle: string;
      userId: number;
      name: string;
      email: string;
      avatarUrl: string | null;
      requestedAt: Date;
    }[] = [];

    // Progress inputs fetched once for every course, then grouped in memory.
    const allLessonIds = courses.flatMap((c) =>
      c.sections.flatMap((s) => s.lessons.map((l) => l.id)),
    );
    const allTestIds = courses.flatMap((c) =>
      c.sections.flatMap((s) =>
        s.lessons.flatMap((l) => (l.test ? [l.test.id] : [])),
      ),
    );
    const [doneLessons, passed] = await Promise.all([
      this.prisma.lessonProgress.findMany({
        where: { lessonId: { in: allLessonIds }, status: 'COMPLETED' },
        select: { userId: true, lessonId: true },
      }),
      this.prisma.testResult.findMany({
        where: { testId: { in: allTestIds }, passed: true },
        distinct: ['userId', 'testId'],
        select: { userId: true, testId: true },
      }),
    ]);

    const teachingCourses = courses.map((c) => {
      const lessonIds = new Set(
        c.sections.flatMap((s) => s.lessons.map((l) => l.id)),
      );
      const testIds = new Set(
        c.sections.flatMap((s) =>
          s.lessons.flatMap((l) => (l.test ? [l.test.id] : [])),
        ),
      );
      const total = lessonIds.size + testIds.size;
      const active = c.enrollments.filter(
        (e) => e.status === 'ACTIVE' || e.status === 'COMPLETED',
      );
      active.forEach((e) => studentIds.add(e.userId));

      for (const e of c.enrollments.filter((x) => x.status === 'PENDING')) {
        pendingRequests.push({
          courseId: c.id,
          courseTitle: c.title,
          userId: e.userId,
          name: displayName(e.user),
          email: e.user.email,
          avatarUrl: e.user.profile?.avatarUrl ?? null,
          requestedAt: e.createdAt,
        });
      }

      let percentSum = 0;
      for (const e of active) {
        const done =
          doneLessons.filter(
            (d) => d.userId === e.userId && lessonIds.has(d.lessonId),
          ).length +
          passed.filter((t) => t.userId === e.userId && testIds.has(t.testId))
            .length;
        percentSum += total === 0 ? 0 : (done / total) * 100;
      }

      return {
        id: c.id,
        title: c.title,
        myRole:
          c.teacherId === teacherId ? 'OWNER' : (c.staff[0]?.role ?? 'TEACHER'),
        imageUrl: c.imageUrl,
        published: c.published,
        price: c.price,
        studentsCount: active.length,
        avgProgress: active.length ? Math.round(percentSum / active.length) : 0,
        pendingCount: c.enrollments.filter((e) => e.status === 'PENDING')
          .length,
      };
    });

    const scoreAgg = await this.prisma.testResult.aggregate({
      where: {
        finishedAt: { not: null },
        test: { lesson: { section: { courseId: { in: courseIds } } } },
      },
      _avg: { score: true },
    });

    // Lesson completions over the last 7 days, oldest first.
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    const completions = await this.prisma.lessonProgress.findMany({
      where: {
        lessonId: { in: allLessonIds },
        completedAt: { gte: start },
      },
      select: { completedAt: true },
    });
    const weeklyActivity = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = dayKey(d);
      return {
        date: key,
        label: WEEKDAYS[d.getDay()],
        count: completions.filter(
          (c) => c.completedAt && dayKey(c.completedAt) === key,
        ).length,
      };
    });

    const tests = await this.prisma.test.findMany({
      where: { id: { in: allTestIds } },
      select: {
        id: true,
        title: true,
        lesson: {
          select: {
            section: {
              select: { course: { select: { id: true, title: true } } },
            },
          },
        },
        results: {
          where: { finishedAt: { not: null } },
          select: { passed: true },
        },
      },
    });
    const attentionTests = tests
      .filter((t) => t.results.length > 0)
      .map((t) => ({
        testId: t.id,
        title: t.title,
        courseId: t.lesson.section.course.id,
        courseTitle: t.lesson.section.course.title,
        attempts: t.results.length,
        passRate: Math.round(
          (t.results.filter((r) => r.passed).length / t.results.length) * 100,
        ),
      }))
      .filter((t) => t.passRate < 60)
      .sort((a, b) => a.passRate - b.passRate)
      .slice(0, 5);

    pendingRequests.sort(
      (a, b) => b.requestedAt.getTime() - a.requestedAt.getTime(),
    );

    return {
      teacherStats: {
        students: studentIds.size,
        activeCourses: courses.filter((c) => c.published).length,
        pendingRequests: pendingRequests.length,
        avgScore:
          scoreAgg._avg.score === null ? null : Math.round(scoreAgg._avg.score),
      },
      teachingCourses,
      pendingRequests: pendingRequests.slice(0, 10),
      weeklyActivity,
      attentionTests,
    };
  }
}
