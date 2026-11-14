/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment -- Prisma mock */
import { ProgressService } from './progress.service';

/**
 * Batched progress (gradebook) must count exactly like the per-student
 * version: completed lessons + distinct passed tests + graded labs.
 */
describe('ProgressService.getProgressMany', () => {
  const lessons = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const tests = [{ id: 10 }, { id: 11 }];
  const assignments = [{ id: 20 }, { id: 21 }];
  // 8 items in total.
  const prisma: any = {
    lesson: { findMany: jest.fn().mockResolvedValue(lessons) },
    test: { findMany: jest.fn().mockResolvedValue(tests) },
    assignment: { findMany: jest.fn().mockResolvedValue(assignments) },
    lessonProgress: {
      groupBy: jest.fn().mockResolvedValue([
        { userId: 1, _count: { _all: 4 } },
        { userId: 2, _count: { _all: 1 } },
      ]),
    },
    testResult: {
      // already distinct per (userId, testId) — the query asks for that
      findMany: jest
        .fn()
        .mockResolvedValue([{ userId: 1 }, { userId: 1 }, { userId: 2 }]),
    },
    submission: {
      groupBy: jest
        .fn()
        .mockResolvedValue([{ userId: 1, _count: { _all: 2 } }]),
    },
  };
  const service = new ProgressService(prisma);

  it('computes every student in a constant number of queries', async () => {
    const res = await service.getProgressMany(5, [1, 2, 3]);
    expect(res.get(1)).toBe(100); // 4 + 2 + 2 of 8
    expect(res.get(2)).toBe(25); // 1 + 1 of 8
    expect(res.get(3)).toBe(0); // nothing yet
    expect(prisma.testResult.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ distinct: ['userId', 'testId'] }),
    );
    const calls =
      prisma.lesson.findMany.mock.calls.length +
      prisma.test.findMany.mock.calls.length +
      prisma.assignment.findMany.mock.calls.length +
      prisma.lessonProgress.groupBy.mock.calls.length +
      prisma.testResult.findMany.mock.calls.length +
      prisma.submission.groupBy.mock.calls.length;
    expect(calls).toBe(6);
  });

  it('returns zeros for an empty course or no students', async () => {
    const empty = new ProgressService({
      ...prisma,
      lesson: { findMany: jest.fn().mockResolvedValue([]) },
      test: { findMany: jest.fn().mockResolvedValue([]) },
      assignment: { findMany: jest.fn().mockResolvedValue([]) },
    });
    expect([...(await empty.getProgressMany(5, [7])).values()]).toEqual([0]);
    expect((await service.getProgressMany(5, [])).size).toBe(0);
  });
});
