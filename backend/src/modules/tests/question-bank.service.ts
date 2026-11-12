import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  assertCourseRole,
  assertRoleOnCourse,
} from '../../common/access/course-access';
import { defaultConfig, normalizeConfig } from './question-types';
import { exportGift, parseGift } from './gift';
import { TestsService, type QuestionInput } from './tests.service';

const questionInclude = { answers: { orderBy: { id: 'asc' } } } as const;

/** Per-course question bank: categories, questions, GIFT import/export, test links. */
@Injectable()
export class QuestionBankService {
  constructor(
    private prisma: PrismaService,
    private tests: TestsService,
  ) {}

  private async categoryCourse(categoryId: number) {
    const cat = await this.prisma.questionBankCategory.findUnique({
      where: { id: categoryId },
      select: {
        id: true,
        courseId: true,
        course: { select: { id: true, teacherId: true } },
      },
    });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  async list(courseId: number, user: AuthUser) {
    await assertCourseRole(this.prisma, courseId, user, 'content');
    const categories = await this.prisma.questionBankCategory.findMany({
      where: { courseId },
      orderBy: { id: 'asc' },
      include: {
        questions: { orderBy: { id: 'asc' }, include: questionInclude },
      },
    });
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      questions: c.questions.map((q) => ({
        id: q.id,
        testId: null,
        categoryId: c.id,
        text: q.text,
        type: q.type,
        difficulty: q.difficulty,
        points: q.points,
        partialCredit: q.partialCredit,
        config: q.config ?? defaultConfig(q.type),
        answers: q.answers,
      })),
    }));
  }

  async createCategory(courseId: number, name: string, user: AuthUser) {
    await assertCourseRole(this.prisma, courseId, user, 'content');
    const clean = name?.trim();
    if (!clean) throw new BadRequestException('Name is required');
    return this.prisma.questionBankCategory.create({
      data: { courseId, name: clean.slice(0, 120) },
    });
  }

  async renameCategory(id: number, name: string, user: AuthUser) {
    const cat = await this.categoryCourse(id);
    await assertRoleOnCourse(this.prisma, cat.course, user, 'content');
    const clean = name?.trim();
    if (!clean) throw new BadRequestException('Name is required');
    return this.prisma.questionBankCategory.update({
      where: { id },
      data: { name: clean.slice(0, 120) },
    });
  }

  async deleteCategory(id: number, user: AuthUser) {
    const cat = await this.categoryCourse(id);
    await assertRoleOnCourse(this.prisma, cat.course, user, 'content');
    await this.prisma.questionBankCategory.delete({ where: { id } });
  }

  async createQuestion(
    categoryId: number,
    data: QuestionInput,
    user: AuthUser,
  ) {
    const cat = await this.categoryCourse(categoryId);
    await assertRoleOnCourse(this.prisma, cat.course, user, 'content');
    return this.prisma.question.create({
      data: { categoryId, ...this.tests.questionData(data) },
      include: questionInclude,
    });
  }

  /** Imports GIFT text into `categoryId`, or into categories named by $CATEGORY lines. */
  async importGift(
    courseId: number,
    data: { text: string; categoryId?: number },
    user: AuthUser,
  ) {
    await assertCourseRole(this.prisma, courseId, user, 'content');
    if (typeof data.text !== 'string' || !data.text.trim()) {
      throw new BadRequestException('GIFT text is empty');
    }
    if (data.text.length > 500_000)
      throw new BadRequestException('File is too large');
    if (data.categoryId) {
      const cat = await this.categoryCourse(data.categoryId);
      if (cat.courseId !== courseId)
        throw new BadRequestException('Category is from another course');
    }
    const { questions, skipped } = parseGift(data.text);
    const byName = new Map<string, number>();
    const existing = await this.prisma.questionBankCategory.findMany({
      where: { courseId },
      select: { id: true, name: true },
    });
    for (const c of existing) byName.set(c.name, c.id);

    const categoryFor = async (name: string | null): Promise<number> => {
      if (data.categoryId) return data.categoryId;
      const key = name || 'GIFT';
      const found = byName.get(key);
      if (found) return found;
      const created = await this.prisma.questionBankCategory.create({
        data: { courseId, name: key },
      });
      byName.set(key, created.id);
      return created.id;
    };

    const categoryIds = new Set<number>();
    for (const q of questions) {
      const categoryId = await categoryFor(q.category);
      categoryIds.add(categoryId);
      await this.prisma.question.create({
        data: {
          categoryId,
          text: q.text.slice(0, 5000),
          type: q.type,
          points: 1,
          partialCredit: q.partialCredit,
          config: (normalizeConfig(q.type, q.config) ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          answers: q.answers.length
            ? {
                create: q.answers.map((a) => ({
                  text: a.text.slice(0, 1000),
                  isCorrect: a.isCorrect,
                })),
              }
            : undefined,
        },
      });
    }
    return {
      imported: questions.length,
      skipped,
      categoryIds: [...categoryIds],
    };
  }

  async exportGift(
    courseId: number,
    categoryId: number | undefined,
    user: AuthUser,
  ) {
    const { course } = await assertCourseRole(
      this.prisma,
      courseId,
      user,
      'content',
    );
    const categories = await this.prisma.questionBankCategory.findMany({
      where: { courseId, ...(categoryId ? { id: categoryId } : {}) },
      orderBy: { id: 'asc' },
      include: {
        questions: { orderBy: { id: 'asc' }, include: questionInclude },
      },
    });
    const { text, skipped } = exportGift(categories);
    const slug =
      course.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `course-${course.id}`;
    const date = new Date().toISOString().slice(0, 10);
    // One extension: ".gift" is what Moodle and other LMSs import.
    return { text, skipped, filename: `question-bank-${slug}-${date}.gift` };
  }

  /** Copies bank questions into a test as its own (fixed) questions. */
  async copyToTest(testId: number, questionIds: number[], user: AuthUser) {
    const test = await this.prisma.test.findUnique({
      where: { id: testId },
      select: {
        lesson: {
          select: {
            section: {
              select: { course: { select: { id: true, teacherId: true } } },
            },
          },
        },
      },
    });
    if (!test) throw new NotFoundException('Test not found');
    const course = test.lesson.section.course;
    await assertRoleOnCourse(this.prisma, course, user, 'content');
    if (!Array.isArray(questionIds) || !questionIds.length) {
      throw new BadRequestException('Nothing to copy');
    }
    const source = await this.prisma.question.findMany({
      where: { id: { in: questionIds }, category: { courseId: course.id } },
      include: questionInclude,
    });
    if (source.length !== new Set(questionIds).size) {
      throw new BadRequestException(
        'Questions must come from this course bank',
      );
    }
    for (const q of source) {
      await this.prisma.question.create({
        data: {
          testId,
          text: q.text,
          type: q.type,
          difficulty: q.difficulty,
          points: q.points,
          partialCredit: q.partialCredit,
          config: q.config ?? undefined,
          answers: q.answers.length
            ? {
                create: q.answers.map((a) => ({
                  text: a.text,
                  isCorrect: a.isCorrect,
                })),
              }
            : undefined,
        },
      });
    }
    return { copied: source.length };
  }

  /** Replaces the test's «N random from category» rules. */
  async setRandomRules(
    testId: number,
    rules: { categoryId: number; count: number }[],
    user: AuthUser,
  ) {
    const test = await this.prisma.test.findUnique({
      where: { id: testId },
      select: {
        lesson: {
          select: {
            section: {
              select: { course: { select: { id: true, teacherId: true } } },
            },
          },
        },
      },
    });
    if (!test) throw new NotFoundException('Test not found');
    const course = test.lesson.section.course;
    await assertRoleOnCourse(this.prisma, course, user, 'content');
    const clean = (Array.isArray(rules) ? rules : []).filter(
      (r) => r && r.count > 0,
    );
    for (const r of clean) {
      if (!Number.isInteger(r.count) || r.count > 100) {
        throw new BadRequestException('Count must be 1..100');
      }
    }
    const ids = [...new Set(clean.map((r) => r.categoryId))];
    if (ids.length !== clean.length)
      throw new BadRequestException('Duplicate category');
    const found = await this.prisma.questionBankCategory.count({
      where: { id: { in: ids }, courseId: course.id },
    });
    if (found !== ids.length)
      throw new BadRequestException('Category is from another course');
    await this.prisma.$transaction([
      this.prisma.testRandomRule.deleteMany({ where: { testId } }),
      this.prisma.testRandomRule.createMany({
        data: clean.map((r) => ({
          testId,
          categoryId: r.categoryId,
          count: r.count,
        })),
      }),
    ]);
    return this.prisma.testRandomRule.findMany({
      where: { testId },
      orderBy: { id: 'asc' },
    });
  }
}
