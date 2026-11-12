import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type CourseLevel } from '@prisma/client';
import {
  validateBands,
  type GradingScaleKind,
} from '../gradebook/grading-scale';
import { PrismaService } from '../../prisma/prisma.service';
import { VideosService } from '../videos/videos.service';
import {
  assertCourseRole,
  can,
  getCourseRole,
  staffCourseWhere,
} from '../../common/access/course-access';
import { ProgressService } from '../progress/progress.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { displayName } from '../../common/utils/names';
import { questionProblem } from '../tests/question-types';

interface CourseFields {
  description?: string;
  imageUrl?: string | null;
  price?: number;
  category?: string;
  level?: CourseLevel;
  published?: boolean;
  autoApprove?: boolean;
}

interface CreateCourseInput extends CourseFields {
  title: string;
}

interface UpdateCourseInput extends CourseFields {
  title?: string;
  testsWeight?: number;
  assignmentsWeight?: number;
  gradePassThreshold?: number;
  gradingScale?: GradingScaleKind;
  gradingScaleConfig?: string;
}

@Injectable()
export class CoursesService {
  constructor(
    private prisma: PrismaService,
    private progress: ProgressService,
    private videos: VideosService,
  ) {}

  async create(data: CreateCourseInput, user: AuthUser) {
    if (user.role !== 'TEACHER') {
      throw new ForbiddenException('Only teachers can create courses');
    }
    return this.prisma.course.create({
      data: {
        title: data.title,
        description: data.description || '',
        imageUrl: data.imageUrl ?? null,
        price: data.price ?? 0,
        category: data.category?.trim() || null,
        level: data.level ?? null,
        published: data.published ?? false,
        autoApprove: data.autoApprove ?? false,
        teacherId: user.id,
        staff: { create: { userId: user.id, role: 'OWNER' } },
      },
    });
  }

  async getCourseWithStructure(courseId: number, user: AuthUser) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        sections: {
          orderBy: { order: 'asc' },
          include: {
            lessons: {
              orderBy: { order: 'asc' },
              include: {
                test: true,
                files: { orderBy: { id: 'asc' } },
                video: true,
                assignment: {
                  select: {
                    id: true,
                    title: true,
                    dueAt: true,
                    maxScore: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    let enrollmentStatus: string | null = null;
    let progress: Awaited<ReturnType<ProgressService['getProgress']>> | null =
      null;

    const myRole = await getCourseRole(this.prisma, courseId, user);
    if (user.role === 'STUDENT') {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: { userId: user.id, courseId, status: 'ACTIVE' },
      });
      if (enrollment) {
        enrollmentStatus = enrollment.status;
        progress = await this.progress.getProgress(courseId, user.id);
      } else if (!can(myRole, 'view')) {
        // A student account on the course team (assistant) may look without enrolling.
        throw new ForbiddenException('You are not enrolled in this course');
      }
    }

    return { ...course, enrollmentStatus, progress, myRole };
  }

  async getCoursesForUser(user: AuthUser, search?: string) {
    // Drafts are visible only to their teacher (and admins).
    const visibility =
      user.role === 'ADMIN'
        ? {}
        : { OR: [{ published: true }, staffCourseWhere(user.id)] };
    const where = {
      AND: [
        visibility,
        search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' as const } },
                {
                  description: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {},
      ],
    };
    const courses = await this.prisma.course.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        imageUrl: true,
        teacherId: true,
        price: true,
        category: true,
        level: true,
        published: true,
        autoApprove: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (user.role !== 'STUDENT') {
      return courses;
    }
    const [enrollments, staff] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { userId: user.id } }),
      // A student account can be an assistant on a course team.
      this.prisma.courseStaff.findMany({
        where: { userId: user.id },
        select: { courseId: true },
      }),
    ]);
    const map: Record<number, string> = Object.fromEntries(
      enrollments.map((e) => [e.courseId, e.status]),
    );
    const staffOf = new Set(staff.map((s) => s.courseId));
    return courses.map((course) => ({
      ...course,
      enrollmentStatus: map[course.id] ?? null,
      isStaff: staffOf.has(course.id),
    }));
  }

  async update(courseId: number, data: UpdateCourseInput, user: AuthUser) {
    const { course, role } = await assertCourseRole(
      this.prisma,
      courseId,
      user,
      'content',
    );
    // Pricing is the owner's call; teachers may edit everything else.
    if (
      data.price !== undefined &&
      data.price !== course.price &&
      !can(role, 'owner')
    ) {
      throw new ForbiddenException(
        'Only the course owner can change the price',
      );
    }
    const testsWeight = data.testsWeight ?? course.testsWeight;
    const assignmentsWeight =
      data.assignmentsWeight ?? course.assignmentsWeight;
    if (testsWeight + assignmentsWeight !== 100) {
      throw new BadRequestException('Grade weights must add up to 100');
    }
    const gradingScale = data.gradingScale ?? course.gradingScale;
    let gradingScaleConfig:
      | Prisma.InputJsonValue
      | typeof Prisma.DbNull
      | undefined;
    if (data.gradingScaleConfig !== undefined) {
      if (data.gradingScaleConfig.trim() === '') {
        gradingScaleConfig = Prisma.DbNull;
      } else {
        let parsed: unknown;
        try {
          parsed = JSON.parse(data.gradingScaleConfig);
        } catch {
          throw new BadRequestException(
            'Grading scale config is not valid JSON',
          );
        }
        const checked = validateBands(gradingScale, parsed);
        if ('error' in checked) throw new BadRequestException(checked.error);
        gradingScaleConfig = checked.bands as unknown as Prisma.InputJsonValue;
      }
    } else if (data.gradingScale && data.gradingScale !== course.gradingScale) {
      // Thresholds belong to a scale; switching scales starts from its defaults.
      gradingScaleConfig = Prisma.DbNull;
    }
    if (data.published === true && !course.published) {
      await this.assertPublishable(courseId);
    }
    return this.prisma.course.update({
      where: { id: courseId },
      data: {
        title: data.title ?? course.title,
        description: data.description ?? course.description,
        imageUrl: data.imageUrl ?? course.imageUrl,
        price: data.price ?? course.price,
        category:
          data.category === undefined
            ? course.category
            : data.category.trim() || null,
        level: data.level ?? course.level,
        published: data.published ?? course.published,
        autoApprove: data.autoApprove ?? course.autoApprove,
        testsWeight,
        assignmentsWeight,
        gradePassThreshold:
          data.gradePassThreshold ?? course.gradePassThreshold,
        gradingScale,
        ...(gradingScaleConfig !== undefined ? { gradingScaleConfig } : {}),
      },
    });
  }

  /**
   * Students can't answer an incomplete question (no correct option, too few
   * pairs…), so a course with one can't be published: 400 lists each problem.
   */
  private async assertPublishable(courseId: number) {
    const tests = await this.prisma.test.findMany({
      where: { lesson: { section: { courseId } } },
      orderBy: [
        { lesson: { section: { order: 'asc' } } },
        { lesson: { order: 'asc' } },
      ],
      include: {
        lesson: { select: { id: true, title: true } },
        questions: {
          orderBy: { id: 'asc' },
          include: { answers: { orderBy: { id: 'asc' } } },
        },
      },
    });
    const problems = tests.flatMap((t) =>
      t.questions.flatMap((q, i) => {
        const problem = questionProblem(q);
        return problem
          ? [
              {
                testId: t.id,
                lessonId: t.lesson.id,
                testTitle: t.title,
                lessonTitle: t.lesson.title,
                questionId: q.id,
                index: i + 1,
                problem,
              },
            ]
          : [];
      }),
    );
    if (problems.length) {
      throw new BadRequestException({
        code: 'INCOMPLETE_QUESTIONS',
        message: 'Some test questions are incomplete',
        errors: problems,
      });
    }
  }

  async getStudentsProgress(courseId: number, user: AuthUser) {
    await assertCourseRole(this.prisma, courseId, user, 'view');

    // Every enrollment (pending/rejected too) so the teacher can filter by status.
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId },
      orderBy: { createdAt: 'desc' },
      include: {
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
    });
    if (enrollments.length === 0) {
      return [];
    }
    const studentIds = enrollments.map((e) => e.userId);

    const totalLessons = await this.prisma.lesson.count({
      where: { section: { courseId } },
    });

    // Scoped to this course's lessons (previously counted every course).
    const lessonsProgress = await this.prisma.lessonProgress.findMany({
      where: {
        userId: { in: studentIds },
        lesson: { section: { courseId } },
      },
      select: { userId: true, status: true, updatedAt: true },
    });
    const lessonsByUser: Record<number, number> = {};
    const lastActivity: Record<number, Date> = {};
    const touch = (userId: number, at: Date | null) => {
      if (at && (!lastActivity[userId] || at > lastActivity[userId])) {
        lastActivity[userId] = at;
      }
    };
    for (const lp of lessonsProgress) {
      if (lp.status === 'COMPLETED') {
        lessonsByUser[lp.userId] = (lessonsByUser[lp.userId] || 0) + 1;
      }
      touch(lp.userId, lp.updatedAt);
    }

    const tests = await this.prisma.test.findMany({
      where: { lesson: { section: { courseId } } },
      select: { id: true },
    });
    const testIds = tests.map((t) => t.id);

    let testResults: {
      userId: number;
      testId: number;
      attempt: number;
      score: number | null;
      passed: boolean | null;
      finishedAt: Date | null;
    }[] = [];
    if (testIds.length > 0) {
      testResults = await this.prisma.testResult.findMany({
        where: {
          testId: { in: testIds },
          userId: { in: studentIds },
          finishedAt: { not: null },
        },
        orderBy: [{ userId: 'asc' }, { testId: 'asc' }, { attempt: 'desc' }],
        select: {
          userId: true,
          testId: true,
          attempt: true,
          score: true,
          passed: true,
          finishedAt: true,
        },
      });
    }
    const passedByUser: Record<number, Set<number>> = {};
    for (const r of testResults) {
      touch(r.userId, r.finishedAt);
      if (r.passed) {
        (passedByUser[r.userId] ??= new Set()).add(r.testId);
      }
    }

    const lastTestResults = new Map<
      string,
      { userId: number; testId: number; score: number | null }
    >();
    for (const r of testResults) {
      const key = `${r.userId}_${r.testId}`;
      if (!lastTestResults.has(key)) {
        lastTestResults.set(key, r);
      }
    }
    const testsByUser: Record<number, number> = {};
    const scoreSumByUser: Record<number, number> = {};
    for (const r of lastTestResults.values()) {
      testsByUser[r.userId] = (testsByUser[r.userId] || 0) + 1;
      scoreSumByUser[r.userId] =
        (scoreSumByUser[r.userId] || 0) + (r.score ?? 0);
    }

    // Assignments count towards progress once graded.
    const assignmentsTotal = await this.prisma.assignment.count({
      where: { lesson: { section: { courseId } } },
    });
    const graded = await this.prisma.submission.findMany({
      where: {
        status: 'GRADED',
        userId: { in: studentIds },
        assignment: { lesson: { section: { courseId } } },
      },
      select: { userId: true, submittedAt: true },
    });
    const gradedByUser: Record<number, number> = {};
    for (const g of graded) {
      gradedByUser[g.userId] = (gradedByUser[g.userId] || 0) + 1;
      touch(g.userId, g.submittedAt);
    }

    return enrollments.map((e) => {
      const student = e.user;
      const profile = student.profile;
      const completedTests = testsByUser[student.id] || 0;
      const averageScore =
        completedTests > 0
          ? Math.round(scoreSumByUser[student.id] / completedTests)
          : null;
      const lessonsDone = lessonsByUser[student.id] || 0;
      const testsPassed = passedByUser[student.id]?.size ?? 0;
      const assignmentsDone = gradedByUser[student.id] || 0;
      const total = totalLessons + testIds.length + assignmentsTotal;
      return {
        userId: student.id,
        name: displayName(student),
        email: student.email,
        lessons: {
          completed: lessonsDone,
          total: totalLessons,
        },
        tests: { completed: completedTests, total: testIds.length },
        averageScore,
        status: e.status,
        // Same formula as ProgressService: lessons + passed tests + graded assignments.
        percent:
          total === 0
            ? 0
            : Math.round(
                ((lessonsDone + testsPassed + assignmentsDone) / total) * 100,
              ),
        avatarUrl: profile?.avatarUrl ?? null,
        lastActivityAt: lastActivity[student.id] ?? null,
      };
    });
  }

  async remove(courseId: number, user: AuthUser) {
    await assertCourseRole(this.prisma, courseId, user, 'owner');
    await this.videos.removeForCourse(courseId);
    await this.prisma.course.delete({ where: { id: courseId } });
  }

  async getTestsSummary(courseId: number, user: AuthUser) {
    await assertCourseRole(this.prisma, courseId, user, 'view');
    const tests = await this.prisma.test.findMany({
      where: { lesson: { section: { courseId } } },
      orderBy: [
        { lesson: { section: { order: 'asc' } } },
        { lesson: { order: 'asc' } },
      ],
      select: {
        id: true,
        title: true,
        lesson: { select: { title: true } },
        results: {
          where: { finishedAt: { not: null } },
          select: { userId: true, score: true, passed: true },
        },
      },
    });
    return tests.map((t) => {
      const attempts = t.results.length;
      const students = new Set(t.results.map((r) => r.userId)).size;
      const passed = t.results.filter((r) => r.passed).length;
      const scoreSum = t.results.reduce((sum, r) => sum + (r.score ?? 0), 0);
      return {
        testId: t.id,
        title: t.title,
        lessonTitle: t.lesson.title,
        attempts,
        students,
        passRate: attempts ? Math.round((passed / attempts) * 100) : null,
        avgScore: attempts ? Math.round(scoreSum / attempts) : null,
      };
    });
  }
}
