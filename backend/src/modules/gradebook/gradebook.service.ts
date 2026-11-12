import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { GradingScale, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCourseRole } from '../../common/access/course-access';
import { displayName } from '../../common/utils/names';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ProgressService } from '../progress/progress.service';
import { NotificationsService } from '../notifications/notifications.service';
import { msg } from '../../common/i18n';
import {
  computeGradebook,
  type OverrideInput,
  type StructureInput,
} from './gradebook.compute';
import { bandsFor } from './grading-scale';
import {
  gradebookCsv,
  gradebookXlsx,
  type ExportLang,
} from './gradebook.export';

const GRADED_STATUSES = ['ACTIVE', 'COMPLETED'] as const;

interface CourseGrading {
  id: number;
  title: string;
  testsWeight: number;
  assignmentsWeight: number;
  gradePassThreshold: number;
  gradingScale: GradingScale;
  gradingScaleConfig: Prisma.JsonValue | null;
}

@Injectable()
export class GradebookService {
  constructor(
    private prisma: PrismaService,
    private progress: ProgressService,
    private notifications: NotificationsService,
  ) {}

  /** Overrides with the staff member's display name, for the given users. */
  private async overrides(
    courseId: number,
    userIds: number[],
  ): Promise<OverrideInput[]> {
    const rows = await this.prisma.gradeOverride.findMany({
      where: { courseId, userId: { in: userIds } },
    });
    const names = await this.userNames(rows.map((r) => r.createdById));
    return rows.map((r) => ({
      userId: r.userId,
      itemKey: r.itemKey,
      value: r.value,
      reason: r.reason,
      by: names.get(r.createdById) ?? '',
      at: r.updatedAt,
    }));
  }

  private async userNames(ids: number[]): Promise<Map<number, string>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        email: true,
        profile: { select: { firstName: true, lastName: true } },
      },
    });
    return new Map(users.map((u) => [u.id, displayName(u)]));
  }

  private async structure(courseId: number): Promise<StructureInput> {
    const sections = await this.prisma.section.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
      select: {
        title: true,
        lessons: {
          orderBy: { order: 'asc' },
          select: {
            test: { select: { id: true, title: true } },
            assignment: {
              select: { id: true, title: true, maxScore: true, dueAt: true },
            },
          },
        },
      },
    });
    return { sections };
  }

  /** Builds the gradebook for the given enrolled users (all when userId is omitted). */
  private async build(course: CourseGrading, onlyUserId?: number) {
    const structure = await this.structure(course.id);
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        courseId: course.id,
        status: { in: [...GRADED_STATUSES] },
        ...(onlyUserId ? { userId: onlyUserId } : {}),
      },
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
    const userIds = enrollments.map((e) => e.userId);
    const testIds = structure.sections
      .flatMap((s) => s.lessons.map((l) => l.test?.id))
      .filter((id): id is number => id !== undefined);
    const assignmentIds = structure.sections
      .flatMap((s) => s.lessons.map((l) => l.assignment?.id))
      .filter((id): id is number => id !== undefined);

    const [results, submissions, overrides] = await Promise.all([
      this.prisma.testResult.findMany({
        where: {
          userId: { in: userIds },
          testId: { in: testIds },
          finishedAt: { not: null },
        },
        select: {
          userId: true,
          testId: true,
          score: true,
          finishedAt: true,
          pendingReview: true,
        },
      }),
      this.prisma.submission.findMany({
        where: { userId: { in: userIds }, assignmentId: { in: assignmentIds } },
        select: {
          userId: true,
          assignmentId: true,
          status: true,
          score: true,
          late: true,
        },
      }),
      this.overrides(course.id, userIds),
    ]);

    const students = await Promise.all(
      enrollments.map(async (e) => ({
        userId: e.userId,
        name: displayName(e.user),
        email: e.user.email,
        avatarUrl: e.user.profile?.avatarUrl ?? null,
        status: e.status,
        progress: (await this.progress.getProgress(course.id, e.userId))
          .percent,
      })),
    );
    students.sort((a, b) => a.name.localeCompare(b.name, 'uk'));

    return computeGradebook({
      settings: course,
      structure,
      students,
      results,
      submissions,
      overrides,
    });
  }

  private courseMeta(course: CourseGrading & { title: string }) {
    return {
      id: course.id,
      title: course.title,
      testsWeight: course.testsWeight,
      assignmentsWeight: course.assignmentsWeight,
      gradePassThreshold: course.gradePassThreshold,
      gradingScale: course.gradingScale,
      /** Effective thresholds (custom or default); null for % and pass/fail. */
      scaleBands: bandsFor(course.gradingScale, course.gradingScaleConfig),
    };
  }

  async gradebook(courseId: number, user: AuthUser) {
    const { course } = await assertCourseRole(
      this.prisma,
      courseId,
      user,
      'view',
    );
    return { course: this.courseMeta(course), ...(await this.build(course)) };
  }

  async export(
    courseId: number,
    user: AuthUser,
    format: 'xlsx' | 'csv',
    lang: ExportLang = 'uk',
  ) {
    const { course } = await assertCourseRole(
      this.prisma,
      courseId,
      user,
      'view',
    );
    const data = {
      course: this.courseMeta(course),
      ...(await this.build(course)),
    };
    const buffer =
      format === 'csv'
        ? gradebookCsv(data, lang)
        : await gradebookXlsx(data, lang);
    return { buffer, filename: exportFilename(course.title, format) };
  }

  // ----- manual overrides

  /** Columns that may be overridden plus their bounds. */
  private async itemBounds(courseId: number) {
    const structure = await this.structure(courseId);
    const bounds = new Map<string, { max: number; title: string }>();
    for (const section of structure.sections) {
      for (const lesson of section.lessons) {
        if (lesson.test) {
          bounds.set(`test-${lesson.test.id}`, {
            max: 100,
            title: lesson.test.title,
          });
        }
        if (lesson.assignment) {
          bounds.set(`assignment-${lesson.assignment.id}`, {
            max: lesson.assignment.maxScore,
            title: lesson.assignment.title,
          });
        }
      }
    }
    bounds.set('final', { max: 100, title: '' });
    return bounds;
  }

  private async assertGradedStudent(courseId: number, userId: number) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (
      !enrollment ||
      !(GRADED_STATUSES as readonly string[]).includes(enrollment.status)
    ) {
      throw new BadRequestException(
        'The student is not enrolled in this course',
      );
    }
  }

  /** Current effective value of one item for one student (before the change). */
  private async currentValue(
    course: CourseGrading,
    userId: number,
    itemKey: string,
  ): Promise<number | null> {
    const { rows } = await this.build(course, userId);
    const row = rows[0];
    if (!row) return null;
    return itemKey === 'final'
      ? row.final
      : (row.cells[itemKey]?.value ?? null);
  }

  async setOverride(
    courseId: number,
    user: AuthUser,
    dto: { userId: number; itemKey: string; value: number; reason: string },
  ) {
    const { course } = await assertCourseRole(
      this.prisma,
      courseId,
      user,
      'grade',
    );
    const bounds = (await this.itemBounds(courseId)).get(dto.itemKey);
    if (!bounds) throw new BadRequestException('Unknown gradebook item');
    if (
      !Number.isFinite(dto.value) ||
      dto.value < 0 ||
      dto.value > bounds.max
    ) {
      throw new BadRequestException(
        `Value must be between 0 and ${bounds.max}`,
      );
    }
    const reason = dto.reason.trim();
    if (reason.length < 5) {
      throw new BadRequestException('Reason must be at least 5 characters');
    }
    await this.assertGradedStudent(courseId, dto.userId);
    const value = Math.round(dto.value * 10) / 10;
    const oldValue = await this.currentValue(course, dto.userId, dto.itemKey);

    await this.prisma.$transaction([
      this.prisma.gradeOverride.upsert({
        where: {
          courseId_userId_itemKey: {
            courseId,
            userId: dto.userId,
            itemKey: dto.itemKey,
          },
        },
        create: {
          courseId,
          userId: dto.userId,
          itemKey: dto.itemKey,
          value,
          reason,
          createdById: user.id,
        },
        update: { value, reason, createdById: user.id },
      }),
      this.prisma.gradeOverrideHistory.create({
        data: {
          courseId,
          userId: dto.userId,
          itemKey: dto.itemKey,
          oldValue,
          newValue: value,
          reason,
          changedById: user.id,
        },
      }),
    ]);
    await this.notifyStudent(
      course,
      dto.userId,
      dto.itemKey,
      bounds.title,
      reason,
      false,
    );
    return this.studentRow(course, dto.userId);
  }

  async clearOverride(
    courseId: number,
    user: AuthUser,
    userId: number,
    itemKey: string,
    reason?: string,
  ) {
    const { course } = await assertCourseRole(
      this.prisma,
      courseId,
      user,
      'grade',
    );
    const existing = await this.prisma.gradeOverride.findUnique({
      where: { courseId_userId_itemKey: { courseId, userId, itemKey } },
    });
    if (!existing) throw new NotFoundException('Override not found');
    const bounds = (await this.itemBounds(courseId)).get(itemKey);
    const note = reason?.trim() || 'Reset to automatic';
    await this.prisma.gradeOverride.delete({ where: { id: existing.id } });
    const computed = await this.currentValue(course, userId, itemKey);
    await this.prisma.gradeOverrideHistory.create({
      data: {
        courseId,
        userId,
        itemKey,
        oldValue: existing.value,
        newValue: computed,
        reason: note,
        changedById: user.id,
      },
    });
    await this.notifyStudent(
      course,
      userId,
      itemKey,
      bounds?.title ?? '',
      note,
      true,
    );
    return this.studentRow(course, userId);
  }

  async overrideHistory(courseId: number, user: AuthUser, userId: number) {
    await assertCourseRole(this.prisma, courseId, user, 'grade');
    const rows = await this.prisma.gradeOverrideHistory.findMany({
      where: { courseId, userId },
      orderBy: { createdAt: 'desc' },
    });
    const names = await this.userNames(rows.map((r) => r.changedById));
    return rows.map((r) => ({
      id: r.id,
      itemKey: r.itemKey,
      oldValue: r.oldValue,
      newValue: r.newValue,
      reason: r.reason,
      by: names.get(r.changedById) ?? '',
      at: r.createdAt,
    }));
  }

  private async studentRow(course: CourseGrading, userId: number) {
    const { rows } = await this.build(course, userId);
    return rows[0] ?? null;
  }

  private async notifyStudent(
    course: CourseGrading & { title: string },
    userId: number,
    itemKey: string,
    itemTitle: string,
    reason: string,
    reset: boolean,
  ) {
    const isFinal = itemKey === 'final';
    const title = isFinal
      ? msg(
          reset
            ? 'notify.gradeUpdated.finalReset'
            : 'notify.gradeUpdated.finalTitle',
        )
      : msg(reset ? 'notify.gradeUpdated.reset' : 'notify.gradeUpdated.title', {
          item: itemTitle,
        });
    await this.notifications.notify(userId, {
      type: 'GRADE_UPDATED',
      title,
      body: msg('notify.gradeUpdated.body', { course: course.title, reason }),
      link: `/courses/${course.id}/grades`,
    });
  }

  async myGrades(courseId: number, user: AuthUser) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId } },
    });
    if (
      !enrollment ||
      !(GRADED_STATUSES as readonly string[]).includes(enrollment.status)
    ) {
      throw new ForbiddenException('You are not enrolled in this course');
    }
    const { columns, rows } = await this.build(course, user.id);
    return { course: this.courseMeta(course), columns, row: rows[0] ?? null };
  }
}

const TRANSLIT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ye',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'yi',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  ю: 'yu',
  я: 'ya',
  ы: 'y',
  э: 'e',
  ъ: '',
  ё: 'yo',
};

/** "Основи веб-розробки" -> "osnovy-veb-rozrobky" (ASCII, for the plain filename). */
export function slugify(title: string): string {
  const latin = title
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('');
  return (
    latin
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'course'
  );
}

export function exportFilename(
  title: string,
  format: 'xlsx' | 'csv',
  now = new Date(),
) {
  const date = now.toISOString().slice(0, 10);
  const ascii = `gradebook-${slugify(title)}-${date}.${format}`;
  const unicodeSlug = title
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .slice(0, 60);
  const unicode = `gradebook-${unicodeSlug}-${date}.${format}`;
  return { ascii, unicode };
}
