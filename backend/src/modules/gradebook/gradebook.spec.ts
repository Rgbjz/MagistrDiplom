/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- loose Prisma mocks */
import { BadRequestException } from '@nestjs/common';
import {
  computeGradebook,
  finalGrade,
  type StructureInput,
} from './gradebook.compute';
import { gradebookCsv, gradebookXlsx } from './gradebook.export';
import { exportFilename, slugify } from './gradebook.service';
import { CoursesService } from '../courses/courses.service';

const settings = {
  testsWeight: 50,
  assignmentsWeight: 50,
  gradePassThreshold: 60,
};
const structure: StructureInput = {
  sections: [
    {
      title: 'Розділ 1',
      lessons: [
        {
          test: { id: 1, title: 'T1' },
          assignment: {
            id: 10,
            title: 'A1',
            maxScore: 50,
            dueAt: new Date('2026-01-01'),
          },
        },
        { test: { id: 2, title: 'T2' }, assignment: null },
      ],
    },
  ],
};
const student = (userId: number) => ({
  userId,
  name: `S${userId}`,
  email: `s${userId}@x.io`,
  avatarUrl: null,
  status: 'ACTIVE',
  progress: 0,
});
const now = new Date('2026-06-01');

describe('computeGradebook', () => {
  it('takes the best finished attempt and ignores unfinished ones', () => {
    const { rows } = computeGradebook({
      settings,
      structure,
      students: [student(1)],
      results: [
        { userId: 1, testId: 1, score: 40, finishedAt: now },
        { userId: 1, testId: 1, score: 90, finishedAt: now },
        { userId: 1, testId: 1, score: 100, finishedAt: null },
      ],
      submissions: [],
      now,
    });
    expect(rows[0].cells['test-1']).toEqual({ value: 90, state: 'graded' });
  });

  it('counts missing work as 0 and marks overdue assignments late', () => {
    const { rows } = computeGradebook({
      settings,
      structure,
      students: [student(1)],
      results: [],
      submissions: [],
      now,
    });
    expect(rows[0].cells['test-2'].state).toBe('missing');
    expect(rows[0].cells['assignment-10'].state).toBe('late');
    expect(rows[0].final).toBe(0);
    expect(rows[0].passed).toBe(false);
  });

  it('weights categories and converts assignment points to percent', () => {
    const { rows, stats } = computeGradebook({
      settings: {
        testsWeight: 40,
        assignmentsWeight: 60,
        gradePassThreshold: 60,
      },
      structure,
      students: [student(1), student(2)],
      results: [
        { userId: 1, testId: 1, score: 80, finishedAt: now },
        { userId: 1, testId: 2, score: 100, finishedAt: now },
      ],
      submissions: [
        {
          userId: 1,
          assignmentId: 10,
          status: 'GRADED',
          score: 40,
          late: false,
        },
        {
          userId: 2,
          assignmentId: 10,
          status: 'SUBMITTED',
          score: null,
          late: true,
        },
      ],
      now,
    });
    // tests avg 90, assignments 40/50 = 80 → 0.4*90 + 0.6*80 = 84
    expect(rows[0]).toMatchObject({
      testsAvg: 90,
      assignmentsAvg: 80,
      final: 84,
      passed: true,
    });
    expect(rows[1].cells['assignment-10']).toEqual({
      value: null,
      state: 'submitted',
      late: true,
    });
    expect(rows[1].final).toBe(0);
    expect(stats).toMatchObject({
      studentsCount: 2,
      avgFinal: 42,
      passRate: 50,
    });
    expect(stats.perColumn['assignment-10']).toEqual({ avg: 40, submitted: 2 });
  });

  it('renormalises weights when a category has no items', () => {
    expect(
      finalGrade(70, null, {
        ...settings,
        testsWeight: 30,
        assignmentsWeight: 70,
      }),
    ).toBe(70);
    expect(finalGrade(null, 55, settings)).toBe(55);
    expect(finalGrade(null, null, settings)).toBeNull();
    // the only present category has weight 0 → plain average
    expect(
      finalGrade(null, 40, {
        ...settings,
        testsWeight: 100,
        assignmentsWeight: 0,
      }),
    ).toBe(40);
  });

  it('applies the pass threshold inclusively', () => {
    const { rows } = computeGradebook({
      settings,
      structure: {
        sections: [
          {
            title: 'S',
            lessons: [{ test: { id: 1, title: 'T' }, assignment: null }],
          },
        ],
      },
      students: [student(1)],
      results: [{ userId: 1, testId: 1, score: 60, finishedAt: now }],
      submissions: [],
      now,
    });
    expect(rows[0]).toMatchObject({ final: 60, passed: true });
  });
});

describe('exports', () => {
  const data = {
    course: { title: 'Основи веб-розробки', ...settings },
    ...computeGradebook({
      settings,
      structure,
      students: [student(1)],
      results: [{ userId: 1, testId: 1, score: 75.5, finishedAt: now }],
      submissions: [],
      now,
    }),
  };

  it('xlsx is a zip container', async () => {
    const buf = await gradebookXlsx(data);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('csv has a BOM, ";" separators and comma decimals', () => {
    const text = gradebookCsv(data).toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const [head, row] = text.slice(1).split('\r\n');
    expect(head.startsWith('Студент;Email;')).toBe(true);
    expect(row).toContain('75,5');
  });

  it('filenames: ASCII slug plus a UTF-8 variant', () => {
    expect(slugify('Основи веб-розробки')).toBe('osnovy-veb-rozrobky');
    const f = exportFilename(
      'Основи веб-розробки',
      'xlsx',
      new Date('2026-11-11T10:00:00Z'),
    );
    expect(f.ascii).toBe('gradebook-osnovy-veb-rozrobky-2026-11-11.xlsx');
    expect(f.unicode).toBe('gradebook-Основи-веб-розробки-2026-11-11.xlsx');
  });
});

describe('CoursesService.update grade weights', () => {
  const course = {
    id: 1,
    teacherId: 7,
    title: 'C',
    description: null,
    imageUrl: null,
    price: 0,
    category: null,
    level: null,
    published: true,
    autoApprove: false,
    testsWeight: 50,
    assignmentsWeight: 50,
    gradePassThreshold: 60,
  };
  const teacher = { id: 7, role: 'TEACHER' as const, email: 't@x.io' };
  let prisma: any;
  let service: CoursesService;

  beforeEach(() => {
    prisma = {
      course: {
        findUnique: jest.fn().mockResolvedValue(course),
        update: jest.fn().mockImplementation(({ data }: { data: object }) => ({
          ...course,
          ...data,
        })),
      },
    };
    service = new CoursesService(prisma, {} as any, {} as any);
  });

  it('rejects weights that do not add up to 100', async () => {
    await expect(
      service.update(1, { testsWeight: 70 }, teacher),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.course.update).not.toHaveBeenCalled();
  });

  it('saves valid weights and threshold', async () => {
    const res = await service.update(
      1,
      { testsWeight: 30, assignmentsWeight: 70, gradePassThreshold: 75 },
      teacher,
    );
    expect(res).toMatchObject({
      testsWeight: 30,
      assignmentsWeight: 70,
      gradePassThreshold: 75,
    });
  });
});
