import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface CreateTestInput {
  title?: string;
  timeLimit?: number;
  passingScore?: number;
}

@Injectable()
export class TestsService {
  constructor(private prisma: PrismaService) {}

  async getById(id: number) {
    const test = await this.prisma.test.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { id: 'asc' },
          include: { answers: { orderBy: { id: 'asc' } } },
        },
      },
    });
    if (!test) {
      throw new NotFoundException('Test not found');
    }
    return test;
  }

  async createTest(lessonId: number, data: CreateTestInput = {}) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { test: true },
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
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

  async update(id: number, data: CreateTestInput) {
    const test = await this.prisma.test.findUnique({ where: { id } });
    if (!test) {
      throw new NotFoundException('Test not found');
    }
    return this.prisma.test.update({ where: { id }, data });
  }

  // ===== QUESTIONS =====

  async createQuestion(
    testId: number,
    data: { text: string; type?: 'SINGLE' | 'MULTIPLE'; difficulty?: number },
  ) {
    return this.prisma.question.create({
      data: {
        testId,
        text: data.text,
        type: data.type ?? 'SINGLE',
        difficulty: data.difficulty ?? 1,
      },
    });
  }

  async updateQuestion(
    id: number,
    data: { text?: string; type?: 'SINGLE' | 'MULTIPLE'; difficulty?: number },
  ) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    return this.prisma.question.update({ where: { id }, data });
  }

  async deleteQuestion(id: number) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    await this.prisma.question.delete({ where: { id } });
  }

  // ===== ANSWERS =====

  async createAnswer(questionId: number, data: { text: string; isCorrect?: boolean }) {
    return this.prisma.answer.create({
      data: { questionId, text: data.text, isCorrect: !!data.isCorrect },
    });
  }

  async updateAnswer(id: number, data: { text?: string; isCorrect?: boolean }) {
    const answer = await this.prisma.answer.findUnique({ where: { id } });
    if (!answer) {
      throw new NotFoundException('Answer not found');
    }
    return this.prisma.answer.update({ where: { id }, data });
  }

  async deleteAnswer(id: number) {
    const answer = await this.prisma.answer.findUnique({ where: { id } });
    if (!answer) {
      throw new NotFoundException('Answer not found');
    }
    await this.prisma.answer.delete({ where: { id } });
  }

  // ===== RESULTS =====

  async getTestResults(testId: number) {
    const test = await this.prisma.test.findUnique({ where: { id: testId } });
    if (!test) {
      throw new NotFoundException('Test not found');
    }
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
      if (!lastResults.has(r.userId)) {
        lastResults.set(r.userId, r);
      }
    }

    return Array.from(lastResults.values()).map((r) => ({
      userId: r.user.id,
      userName: r.user.profile
        ? `${r.user.profile.firstName ?? ''} ${r.user.profile.lastName ?? ''}`.trim()
        : 'Без имени',
      email: r.user.email,
      attempt: r.attempt,
      score: r.score,
      passed: r.passed,
      finishedAt: r.finishedAt,
    }));
  }

  async getMyTestResult(userId: number, testId: number) {
    const result = await this.prisma.testResult.findFirst({
      where: { userId, testId, finishedAt: { not: null } },
      orderBy: { attempt: 'desc' },
      include: { answers: true },
    });
    if (!result) {
      return null;
    }

    const questions = await this.prisma.question.findMany({
      where: { testId },
      include: { answers: true },
    });

    const details = questions.map((q) => {
      const correctAnswerIds = q.answers
        .filter((a) => a.isCorrect)
        .map((a) => a.id);
      const userAnswerIds = result.answers
        .filter((a) => a.questionId === q.id)
        .map((a) => a.answerId);
      return { questionId: q.id, correctAnswerIds, userAnswerIds };
    });

    return {
      id: result.id,
      score: result.score,
      passed: result.passed,
      finishedAt: result.finishedAt,
      details,
    };
  }

  // ===== TAKING A TEST =====

  async startTest(testId: number, userId: number) {
    const test = await this.prisma.test.findUnique({
      where: { id: testId },
      include: {
        questions: {
          orderBy: { id: 'asc' },
          include: {
            answers: { orderBy: { id: 'asc' }, select: { id: true, text: true } },
          },
        },
      },
    });
    if (!test) {
      throw new NotFoundException('Test not found');
    }

    const attempts = await this.prisma.testResult.count({
      where: { testId, userId },
    });

    const testResult = await this.prisma.testResult.create({
      data: { testId, userId, attempt: attempts + 1, startedAt: new Date() },
    });

    return {
      testResultId: testResult.id,
      attempt: testResult.attempt,
      timeLimit: test.timeLimit,
      startedAt: testResult.startedAt,
      questions: test.questions,
    };
  }

  async submitTest(
    testResultId: number,
    userId: number,
    answers: Record<string, number[]>,
  ) {
    const testResult = await this.prisma.testResult.findUnique({
      where: { id: testResultId },
      include: {
        test: { include: { questions: { include: { answers: true } } } },
      },
    });

    if (!testResult) {
      throw new NotFoundException('Test result not found');
    }
    if (testResult.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    if (testResult.finishedAt) {
      throw new BadRequestException('Test already submitted');
    }

    const deadline = new Date(testResult.startedAt);
    deadline.setMinutes(deadline.getMinutes() + testResult.test.timeLimit);
    const finishedAt = new Date();
    if (finishedAt > deadline) {
      finishedAt.setTime(deadline.getTime());
    }

    let correct = 0;
    for (const question of testResult.test.questions) {
      const correctIds = question.answers
        .filter((a) => a.isCorrect)
        .map((a) => a.id)
        .sort((x, y) => x - y);
      const userIds = (answers[question.id] ?? [])
        .slice()
        .sort((x, y) => x - y);

      const isCorrect =
        correctIds.length === userIds.length &&
        correctIds.every((id, i) => id === userIds[i]);

      for (const answerId of userIds) {
        await this.prisma.userAnswer.create({
          data: { userId, questionId: question.id, answerId, testResultId },
        });
      }

      if (isCorrect) {
        correct++;
      }
    }

    const total = testResult.test.questions.length;
    const score = Math.round((correct / total) * 100);
    const passed = score >= testResult.test.passingScore;

    await this.prisma.testResult.update({
      where: { id: testResultId },
      data: { finishedAt, score, passed },
    });

    return { score, passed, correct, total, finishedAt };
  }
}
