/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- small Prisma stand-in */
import { ForbiddenException } from '@nestjs/common';
import { AdaptiveService } from './adaptive.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

type Row = Record<string, any>;

/**
 * Course 1 with two sections (10, 20); teacher 1; students 2..7 enrolled.
 * Only the Prisma calls the service makes are emulated.
 */
function makeDb(settings: Row | null = null) {
  const enrollments: Row[] = [2, 3, 4, 5, 6, 7].map((userId, i) => ({
    id: 100 + i,
    userId,
    courseId: 1,
    status: 'ACTIVE',
    adaptiveGroup: null,
    enrolledAt: new Date(2026, 0, 1),
    completedAt: null,
    user: { email: `s${userId}@x`, profile: null },
  }));
  const mastery: Row[] = [];
  const events: Row[] = [];
  let stored: Row | null = settings;

  const prisma: any = {
    courseAdaptiveSettings: {
      findUnique: jest.fn(() => stored),
      upsert: jest.fn(({ create, update }) => {
        stored = stored ? { ...stored, ...update } : create;
        return stored;
      }),
    },
    course: {
      findUnique: jest.fn(({ select }) =>
        select?.sections
          ? {
              id: 1,
              title: 'C',
              sections: [
                {
                  id: 10,
                  title: 'HTML',
                  lessons: [
                    {
                      id: 11,
                      title: 'Теги',
                      test: { id: 5, passingScore: 60 },
                      assignment: null,
                    },
                  ],
                },
                {
                  id: 20,
                  title: 'CSS',
                  lessons: [
                    {
                      id: 21,
                      title: 'Селектори',
                      test: null,
                      assignment: null,
                    },
                  ],
                },
              ],
            }
          : { id: 1, teacherId: 1 },
      ),
    },
    courseStaff: {
      findUnique: jest.fn(() => null),
      findFirst: jest.fn(() => null),
    },
    enrollment: {
      findUnique: jest.fn(
        ({ where }) =>
          enrollments.find(
            (e) =>
              e.userId === where.userId_courseId.userId &&
              e.courseId === where.userId_courseId.courseId,
          ) ?? null,
      ),
      findMany: jest.fn(() => enrollments),
      groupBy: jest.fn(() => {
        const c = { ADAPTIVE: 0, CONTROL: 0 } as Record<string, number>;
        for (const e of enrollments) if (e.adaptiveGroup) c[e.adaptiveGroup]++;
        return Object.entries(c)
          .filter(([, n]) => n > 0)
          .map(([g, n]) => ({ adaptiveGroup: g, _count: { _all: n } }));
      }),
      update: jest.fn(({ where, data }) => {
        const e = enrollments.find((x) => x.id === where.id)!;
        Object.assign(e, data);
        return e;
      }),
    },
    learnerSectionMastery: {
      findUnique: jest.fn(
        ({ where }) =>
          mastery.find(
            (m) =>
              m.userId === where.userId_sectionId.userId &&
              m.sectionId === where.userId_sectionId.sectionId,
          ) ?? null,
      ),
      findMany: jest.fn(({ where }) =>
        mastery.filter(
          (m) =>
            m.userId === where.userId &&
            (where.mastery?.lt === undefined || m.mastery < where.mastery.lt),
        ),
      ),
      upsert: jest.fn(({ where, create, update }) => {
        const found = mastery.find(
          (m) =>
            m.userId === where.userId_sectionId.userId &&
            m.sectionId === where.userId_sectionId.sectionId,
        );
        if (found) Object.assign(found, update);
        else mastery.push({ ...create });
      }),
    },
    learnerAbility: { findUnique: jest.fn(() => ({ theta: -1, answers: 10 })) },
    testResult: { findFirst: jest.fn(() => null), findMany: jest.fn(() => []) },
    lessonProgress: { findMany: jest.fn(() => []) },
    submission: {
      findMany: jest.fn(() => []),
      findUnique: jest.fn(() => ({
        userId: 2,
        score: 30,
        assignment: {
          id: 9,
          maxScore: 100,
          lesson: { sectionId: 10, section: { courseId: 1 } },
        },
      })),
    },
    adaptiveEvent: {
      create: jest.fn(({ data }) => events.push(data)),
      createMany: jest.fn(({ data }) => events.push(...data)),
      findMany: jest.fn(() => []),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
  return { prisma, enrollments, mastery, events };
}

const student = (id: number): AuthUser => ({ id, role: 'STUDENT' });
const teacher: AuthUser = { id: 1, role: 'TEACHER' };

function service(db: ReturnType<typeof makeDb>) {
  const s = new AdaptiveService(db.prisma);
  let x = 0.37;
  s.rng = () => (x = ((x * 9301 + 49297) % 233280) / 233280);
  return s;
}

const pool = [-2, -1, 0, 1, 2].map((b, i) => ({
  id: i + 1,
  difficulty: 2,
  calibratedDifficulty: b,
}));

describe('AdaptiveService', () => {
  it('assembles an adaptive attempt matched to a weak student (θ = −1)', async () => {
    const db = makeDb({
      enabled: true,
      masteryThreshold: 0.6,
      accelerationThreshold: 0.85,
      adaptiveTestsDefault: false,
      experimentMode: 'OFF',
      experimentStartedAt: null,
    });
    const plan = await service(db).planAttempt({
      userId: 2,
      testId: 5,
      testAdaptive: true,
      courseId: 1,
      sectionId: 10,
      pool,
      count: 2,
    });
    // b* = −1 − ln(0.7/0.3) ≈ −1.85 → the two easiest questions
    expect(plan!.ids.sort()).toEqual([1, 2]);
    expect(plan!.target).toBeCloseTo(-1.847, 2);
    expect(db.events.some((e) => e.type === 'ADAPTIVE_TEST_GENERATED')).toBe(
      true,
    );
  });

  it('keeps the usual draw when the test is not adaptive', async () => {
    const db = makeDb();
    const plan = await service(db).planAttempt({
      userId: 2,
      testId: 5,
      testAdaptive: null, // course default: off
      courseId: 1,
      sectionId: 10,
      pool,
      count: 2,
    });
    expect(plan).toBeNull();
  });

  it('starting an A/B experiment splits students into balanced arms', async () => {
    const db = makeDb();
    await service(db).updateSettings(1, { experimentMode: 'AB_TEST' }, teacher);
    const groups = db.enrollments.map((e) => e.adaptiveGroup);
    expect(groups.filter((g) => g === 'ADAPTIVE')).toHaveLength(3);
    expect(groups.filter((g) => g === 'CONTROL')).toHaveLength(3);
  });

  it('control students get fixed tests and no recommendations', async () => {
    const db = makeDb({
      enabled: true,
      masteryThreshold: 0.6,
      accelerationThreshold: 0.85,
      adaptiveTestsDefault: true,
      experimentMode: 'AB_TEST',
      experimentStartedAt: new Date(),
    });
    db.enrollments[0].adaptiveGroup = 'CONTROL';
    db.mastery.push({
      userId: 2,
      courseId: 1,
      sectionId: 10,
      mastery: 0.2,
      evidence: 6,
    });
    const svc = service(db);
    const plan = await svc.planAttempt({
      userId: 2,
      testId: 5,
      testAdaptive: true,
      courseId: 1,
      sectionId: 10,
      pool,
      count: 2,
    });
    expect(plan).toBeNull();
    const me = await svc.me(1, student(2));
    expect(me.group).toBe('CONTROL');
    expect(me.adaptive).toBe(false);
    expect(me.recommendations).toEqual([]);
    expect(me.sections[0].level).toBe('weak'); // the model is still kept
  });

  it('an adaptive student with a weak topic is told to review it', async () => {
    const db = makeDb();
    db.mastery.push({
      userId: 2,
      courseId: 1,
      sectionId: 10,
      mastery: 0.2,
      evidence: 6,
    });
    const me = await service(db).me(1, student(2));
    expect(me.adaptive).toBe(true);
    expect(me.recommendations[0]).toMatchObject({
      type: 'REVIEW',
      lessonId: 11,
    });
    expect(
      db.events.filter((e) => e.type === 'RECOMMENDATION_SHOWN').length,
    ).toBeGreaterThan(0);
  });

  it('a newcomer during an experiment joins the smaller arm', async () => {
    const db = makeDb({
      enabled: true,
      masteryThreshold: 0.6,
      accelerationThreshold: 0.85,
      adaptiveTestsDefault: false,
      experimentMode: 'AB_TEST',
      experimentStartedAt: new Date(),
    });
    db.enrollments
      .slice(1)
      .forEach((e, i) => (e.adaptiveGroup = i < 3 ? 'ADAPTIVE' : 'CONTROL')); // 3 vs 2
    const r = await service(db).isAdaptiveFor(2, 1);
    expect(r.group).toBe('CONTROL');
    expect(db.enrollments[0].adaptiveGroup).toBe('CONTROL');
  });

  it('a graded assignment lowers the mastery of its section', async () => {
    const db = makeDb();
    await service(db).onAssignmentGraded(1);
    const m = db.mastery.find((x) => x.userId === 2 && x.sectionId === 10)!;
    // 0.5 + 0.3·0.8·(0.3 − 0.5) = 0.452
    expect(m.mastery).toBeCloseTo(0.452, 6);
    expect(m.evidence).toBe(1);
  });

  it('only enrolled students see their model', async () => {
    const db = makeDb();
    await expect(service(db).me(1, student(99))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
