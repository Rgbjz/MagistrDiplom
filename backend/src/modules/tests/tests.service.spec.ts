/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- loose Prisma mocks */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TestsService } from './tests.service';

const course = { id: 9, title: 'SQL', teacherId: 50 };

function q(id: number, type: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type,
    text: `Q${id}`,
    points: 1,
    partialCredit: false,
    config: null,
    answers: [],
    ...extra,
  };
}

const single = q(10, 'SINGLE', {
  answers: [
    { id: 100, text: 'a', isCorrect: true },
    { id: 101, text: 'b', isCorrect: false },
  ],
});
const multiple = q(11, 'MULTIPLE', {
  answers: [
    { id: 110, text: 'a', isCorrect: true },
    { id: 111, text: 'b', isCorrect: true },
    { id: 112, text: 'c', isCorrect: false },
  ],
});
const essay = q(12, 'ESSAY', {
  points: 2,
  config: { maxWords: null, rubric: '' },
});

function attempt(questions: any[], overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    userId: 1,
    testId: 3,
    startedAt: new Date(),
    finishedAt: null,
    questions: questions.map((question, position) => ({
      id: 1000 + position,
      question,
      maxPoints: question.points,
      position,
    })),
    user: { email: 's@x.io', profile: null },
    test: {
      title: 'JOIN',
      timeLimit: 15,
      passingScore: 60,
      questions,
      lesson: { section: { course } },
    },
    ...overrides,
  };
}

describe('TestsService.submitTest', () => {
  let prisma: any;
  let notifications: { notify: jest.Mock; notifyMany: jest.Mock };
  let service: TestsService;

  beforeEach(() => {
    prisma = {
      testResult: {
        findUnique: jest.fn().mockResolvedValue(attempt([single, multiple])),
        update: jest.fn().mockReturnValue('result-op'),
      },
      attemptQuestion: {
        update: jest.fn().mockImplementation((args) => ({ op: 'aq', args })),
        create: jest
          .fn()
          .mockImplementation((args) => ({ op: 'aq-create', args })),
      },
      courseStaff: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    notifications = {
      notify: jest.fn().mockResolvedValue(undefined),
      notifyMany: jest.fn().mockResolvedValue(undefined),
    };
    service = new TestsService(prisma, notifications as any);
  });

  it('scores per question and stores every response in one transaction', async () => {
    const res = await service.submitTest(7, 1, {
      '10': { answerIds: [100] },
      '11': [110], // incomplete multiple choice, legacy array form → wrong
    });
    expect(res).toMatchObject({
      correct: 1,
      total: 2,
      score: 50,
      passed: false,
      pendingReview: false,
    });
    const ops = prisma.$transaction.mock.calls[0][0];
    expect(ops).toHaveLength(3);
    expect(prisma.attemptQuestion.update).toHaveBeenCalledWith({
      where: { id: 1000 },
      data: { response: { answerIds: [100] }, earned: 1, status: 'AUTO' },
    });
    expect(prisma.testResult.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({
        score: 50,
        passed: false,
        pendingReview: false,
      }),
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ type: 'TEST_RESULT' }),
    );
  });

  it('gives partial credit for MULTIPLE when enabled', async () => {
    prisma.testResult.findUnique.mockResolvedValue(
      attempt([{ ...multiple, partialCredit: true, points: 2 }]),
    );
    const res = await service.submitTest(7, 1, { '11': { answerIds: [110] } });
    expect(res.score).toBe(50);
  });

  it('leaves an essay pending: passed is null and staff are asked to review', async () => {
    prisma.testResult.findUnique.mockResolvedValue(attempt([single, essay]));
    const res = await service.submitTest(7, 1, {
      '10': { answerIds: [100] },
      '12': { text: 'My essay' },
    });
    expect(res).toMatchObject({ pendingReview: true, passed: null, score: 33 });
    expect(notifications.notifyMany).toHaveBeenCalledWith(
      [50],
      expect.anything(),
    );
  });

  it('rejects an answer that belongs to another question', async () => {
    await expect(
      service.submitTest(7, 1, { '10': [110] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unknown questions, malformed values and several answers for SINGLE', async () => {
    await expect(
      service.submitTest(7, 1, { '999': [1] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.submitTest(7, 1, { '10': 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.submitTest(7, 1, { '10': [100, 101] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('scores legacy attempts (no stored questions) from the test questions', async () => {
    prisma.testResult.findUnique.mockResolvedValue({
      ...attempt([single]),
      questions: [],
    });
    const res = await service.submitTest(7, 1, { '10': [100] });
    expect(res.score).toBe(100);
    expect(prisma.attemptQuestion.create).toHaveBeenCalled();
  });

  it('rejects another user and a second submission', async () => {
    await expect(service.submitTest(7, 2, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    prisma.testResult.findUnique.mockResolvedValue(
      attempt([single], { finishedAt: new Date() }),
    );
    await expect(service.submitTest(7, 1, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('TestsService.startTest', () => {
  function setup(test: Record<string, unknown>, attempts = 0) {
    const created: any[] = [];
    const prisma: any = {
      test: {
        findUnique: jest
          .fn()
          .mockImplementation(({ select }) =>
            select ? { lesson: { section: { course } } } : test,
          ),
      },
      enrollment: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      testResult: {
        count: jest.fn().mockResolvedValue(attempts),
        create: jest.fn().mockImplementation(({ data }) => {
          created.push(data);
          return { id: 5, attempt: data.attempt, startedAt: new Date() };
        }),
      },
    };
    const service = new TestsService(prisma, {} as any);
    service.rng = () => 0.42;
    return { service, created };
  }
  const base = {
    id: 3,
    timeLimit: 10,
    shuffleQuestions: false,
    shuffleAnswers: false,
    maxAttempts: null,
    questionsPerAttempt: null,
    randomRules: [],
  };

  it('stores the drawn questions and never sends the key', async () => {
    const { service, created } = setup({
      ...base,
      questions: [single, multiple],
    });
    const res: any = await service.startTest(3, 1);
    expect(created[0].questions.create.map((r: any) => r.questionId)).toEqual([
      10, 11,
    ]);
    expect(JSON.stringify(res.questions)).not.toContain('isCorrect');
  });

  it('draws a random subset and adds bank questions per rule', async () => {
    const bankQ = q(40, 'TRUE_FALSE', { config: { correct: true } });
    const { service, created } = setup({
      ...base,
      questionsPerAttempt: 1,
      questions: [single, multiple],
      randomRules: [{ count: 1, category: { questions: [bankQ] } }],
    });
    await service.startTest(3, 1);
    const ids = created[0].questions.create.map((r: any) => r.questionId);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(40);
  });

  it('refuses when the attempt limit is reached', async () => {
    const { service } = setup(
      { ...base, maxAttempts: 2, questions: [single] },
      2,
    );
    await expect(service.startTest(3, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('TestsService.gradeEssay', () => {
  function setup(rows: any[]) {
    const prisma: any = {
      attemptQuestion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 77,
          testResultId: 7,
          maxPoints: 2,
          question: { type: 'ESSAY' },
          testResult: {
            userId: 1,
            test: {
              id: 3,
              title: 'T',
              passingScore: 60,
              lesson: { section: { course } },
            },
          },
        }),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue(rows),
      },
      testResult: {
        update: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 7, ...data })),
      },
      courseStaff: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const notifications = { notify: jest.fn() };
    return {
      prisma,
      notifications,
      service: new TestsService(prisma, notifications as any),
    };
  }
  const teacher = { id: 50, role: 'TEACHER' as const };

  it('recomputes the score and notifies once nothing is pending', async () => {
    const { service, prisma, notifications } = setup([
      { earned: 1, maxPoints: 1, status: 'AUTO' },
      { earned: 2, maxPoints: 2, status: 'GRADED' },
    ]);
    const res = await service.gradeEssay(
      77,
      { points: 2, feedback: 'Добре' },
      teacher,
    );
    expect(res).toMatchObject({
      score: 100,
      passed: true,
      pendingReview: false,
    });
    expect(prisma.attemptQuestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          earned: 2,
          status: 'GRADED',
          feedback: 'Добре',
        }),
      }),
    );
    expect(notifications.notify).toHaveBeenCalled();
  });

  it('rejects points above the maximum and other users', async () => {
    const { service } = setup([]);
    await expect(
      service.gradeEssay(77, { points: 3 }, teacher),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.gradeEssay(77, { points: 1 }, { id: 99, role: 'TEACHER' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('TestsService.getById', () => {
  const test = {
    id: 1,
    lessonId: 2,
    title: 'T',
    timeLimit: 10,
    passingScore: 60,
    shuffleQuestions: false,
    shuffleAnswers: false,
    maxAttempts: 3,
    questionsPerAttempt: null,
    showCorrectAnswers: 'AFTER_SUBMIT',
    questions: [single],
    randomRules: [],
  };
  function service(staff: boolean) {
    const prisma: any = {
      test: {
        findUnique: jest
          .fn()
          .mockImplementation(({ select }) =>
            select ? { lesson: { section: { course } } } : test,
          ),
      },
      course: { findUnique: jest.fn().mockResolvedValue(course) },
      courseStaff: {
        findUnique: jest
          .fn()
          .mockResolvedValue(staff ? { role: 'ASSISTANT' } : null),
      },
      testResult: { count: jest.fn().mockResolvedValue(1) },
    };
    return new TestsService(prisma, {} as any);
  }

  it('gives students only the intro data, never questions or the key', async () => {
    const res: any = await service(false).getById(1, {
      id: 1,
      role: 'STUDENT',
    });
    expect(res.questions).toEqual([]);
    expect(res).toMatchObject({
      questionCount: 1,
      attemptsUsed: 1,
      attemptsLeft: 2,
    });
  });

  it('gives course staff the full test with the key', async () => {
    const res: any = await service(true).getById(1, { id: 2, role: 'STUDENT' });
    expect(res.questions[0].answers[0].isCorrect).toBe(true);
  });
});
