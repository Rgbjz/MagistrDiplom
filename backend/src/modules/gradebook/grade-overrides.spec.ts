/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- loose Prisma mocks */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { computeGradebook, type StructureInput } from './gradebook.compute';
import { gradebookCsv, gradebookXlsx } from './gradebook.export';
import { scaleGrade, validateBands, DEFAULT_ECTS } from './grading-scale';
import { GradebookService } from './gradebook.service';
import { CoursesService } from '../courses/courses.service';

const now = new Date('2026-06-01');
const structure: StructureInput = {
  sections: [
    {
      title: 'Розділ 1',
      lessons: [
        {
          test: { id: 1, title: 'T1' },
          assignment: { id: 10, title: 'A1', maxScore: 50, dueAt: null },
        },
      ],
    },
  ],
};
const student = {
  userId: 1,
  name: 'S1',
  email: 's1@x.io',
  avatarUrl: null,
  status: 'ACTIVE',
  progress: 0,
};
const base = {
  testsWeight: 50,
  assignmentsWeight: 50,
  gradePassThreshold: 60,
};
const override = (itemKey: string, value: number) => ({
  userId: 1,
  itemKey,
  value,
  reason: 'Апеляція студента',
  by: 'Ірина Мельник',
  at: now,
});

function book(settings: object, overrides: ReturnType<typeof override>[] = []) {
  return computeGradebook({
    settings: { ...base, ...settings },
    structure,
    students: [student],
    results: [{ userId: 1, testId: 1, score: 40, finishedAt: now }],
    submissions: [],
    overrides,
    now,
  });
}

describe('overrides in computeGradebook', () => {
  it('replaces a cell, keeps the original and recomputes the final', () => {
    const { rows } = book({}, [override('assignment-10', 45)]);
    const cell = rows[0].cells['assignment-10'];
    expect(cell.value).toBe(45);
    expect(cell.state).toBe('graded');
    expect(cell.overridden).toMatchObject({
      value: 45,
      original: null,
      reason: 'Апеляція студента',
      by: 'Ірина Мельник',
    });
    // tests 40%, assignments 45/50 = 90% → 65
    expect(rows[0].final).toBe(65);
  });

  it('a final override wins over the computed final', () => {
    const { rows } = book({}, [override('final', 88)]);
    expect(rows[0].final).toBe(88);
    expect(rows[0].finalOverridden).toMatchObject({ value: 88, original: 20 });
    expect(rows[0].passed).toBe(true);
  });

  it('cell and final overrides together: final still wins', () => {
    const { rows } = book({}, [override('test-1', 100), override('final', 30)]);
    expect(rows[0].cells['test-1'].overridden?.original).toBe(40);
    expect(rows[0].final).toBe(30);
    expect(rows[0].passed).toBe(false);
  });
});

describe('grading scales', () => {
  it('five-point boundaries', () => {
    const g = (v: number) => scaleGrade(v, 'FIVE_POINT', null, 60);
    expect(g(90)).toEqual({ code: '5', passed: true });
    expect(g(89.9)).toEqual({ code: '4', passed: true });
    expect(g(75)).toEqual({ code: '4', passed: true });
    expect(g(60)).toEqual({ code: '3', passed: true });
    expect(g(59.9)).toEqual({ code: '2', passed: false });
  });

  it('ECTS boundaries incl. FX/F', () => {
    const g = (v: number) => scaleGrade(v, 'ECTS', null, 60)?.code;
    expect([100, 90, 82, 74, 64, 60, 59, 35, 34, 0].map(g)).toEqual([
      'A',
      'A',
      'B',
      'C',
      'D',
      'E',
      'FX',
      'FX',
      'F',
      'F',
    ]);
    expect(scaleGrade(60, 'ECTS', null, 60)?.passed).toBe(true);
    expect(scaleGrade(59, 'ECTS', null, 60)?.passed).toBe(false);
  });

  it('pass/fail follows the course threshold; percent keeps the number', () => {
    expect(scaleGrade(70, 'PASS_FAIL', null, 70)).toEqual({
      code: 'PASS',
      passed: true,
    });
    expect(scaleGrade(69, 'PASS_FAIL', null, 70)).toEqual({
      code: 'FAIL',
      passed: false,
    });
    expect(scaleGrade(55.5, 'PERCENT', null, 60)).toEqual({
      code: '55.5',
      passed: false,
    });
    expect(scaleGrade(null, 'ECTS', null, 60)).toBeNull();
  });

  it('custom thresholds are used when valid', () => {
    const custom = DEFAULT_ECTS.map((b) =>
      b.code === 'A' ? { ...b, min: 95 } : b,
    );
    expect(scaleGrade(92, 'ECTS', custom, 60)?.code).toBe('B');
  });

  it('validates custom thresholds', () => {
    expect(validateBands('ECTS', DEFAULT_ECTS)).toEqual({
      bands: DEFAULT_ECTS,
    });
    const swapped = DEFAULT_ECTS.map((b) =>
      b.code === 'B' ? { ...b, min: 95 } : b,
    );
    expect(validateBands('ECTS', swapped)).toHaveProperty('error');
    const noZero = DEFAULT_ECTS.map((b) =>
      b.code === 'F' ? { ...b, min: 5 } : b,
    );
    expect(validateBands('ECTS', noZero)).toHaveProperty('error');
    expect(validateBands('ECTS', [{ code: 'A', min: 90 }])).toHaveProperty(
      'error',
    );
    expect(
      validateBands('FIVE_POINT', [
        { code: '5', min: 101 },
        { code: '4', min: 75 },
        { code: '3', min: 60 },
        { code: '2', min: 0 },
      ]),
    ).toHaveProperty('error');
    expect(validateBands('PERCENT', [])).toHaveProperty('error');
  });

  it('the gradebook passes by the scale (ECTS E and above)', () => {
    const { rows } = book({ gradingScale: 'ECTS' }, [override('final', 61)]);
    expect(rows[0].scaleGrade).toEqual({ code: 'E', passed: true });
    expect(rows[0].passed).toBe(true);
  });
});

describe('exports mark overrides and add the scale column', () => {
  const data = () => ({
    course: { title: 'C', ...base, gradingScale: 'FIVE_POINT' },
    ...book({ gradingScale: 'FIVE_POINT' }, [
      override('assignment-10', 45),
      override('final', 91),
    ]),
  });

  it('csv: «*» suffix, scale column and a legend line', () => {
    const text = gradebookCsv(data()).toString('utf8').slice(1);
    const [head, row] = text.split('\r\n');
    expect(head).toContain('Оцінка за шкалою');
    expect(row).toContain('45*');
    expect(row).toContain('91*');
    expect(row).toContain('5 (відмінно)');
    expect(text).toContain('* — оцінку змінено вручну');
  });

  it('xlsx: italic + a note with the reason on overridden cells', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await gradebookXlsx(data(), 'en')) as any);
    const ws = wb.getWorksheet('Gradebook')!;
    const header = ws.getRow(1).values as unknown[];
    expect(header).toContain('Scale grade');
    const cell = ws.getRow(2).getCell(4); // assignment column (test is 3)
    expect(cell.font?.italic).toBe(true);
    expect(JSON.stringify(cell.note)).toContain('Апеляція студента');
    expect(ws.getRow(2).getCell(8).value).toBe('5 (excellent)');
  });
});

describe('GradebookService overrides', () => {
  const course = {
    id: 5,
    teacherId: 7,
    title: 'Курс',
    ...base,
    gradingScale: 'PERCENT',
    gradingScaleConfig: null,
  };
  const owner = { id: 7, role: 'TEACHER' as const, email: 'o@x.io' };
  const assistant = { id: 8, role: 'STUDENT' as const, email: 'a@x.io' };
  const stranger = { id: 9, role: 'STUDENT' as const, email: 's@x.io' };
  let prisma: any;
  let notifications: { notify: jest.Mock };
  let service: GradebookService;

  beforeEach(() => {
    prisma = {
      course: { findUnique: jest.fn().mockResolvedValue(course) },
      courseStaff: {
        findUnique: jest.fn(({ where }: any) =>
          where.courseId_userId.userId === 8 ? { role: 'ASSISTANT' } : null,
        ),
      },
      section: {
        findMany: jest.fn().mockResolvedValue([
          {
            title: 'S',
            lessons: [
              {
                test: { id: 1, title: 'T1' },
                assignment: { id: 10, title: 'A1', maxScore: 50, dueAt: null },
              },
            ],
          },
        ]),
      },
      enrollment: {
        findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
        findMany: jest.fn().mockResolvedValue([
          {
            userId: 1,
            status: 'ACTIVE',
            user: { id: 1, email: 's1@x.io', profile: null },
          },
        ]),
      },
      testResult: { findMany: jest.fn().mockResolvedValue([]) },
      submission: { findMany: jest.fn().mockResolvedValue([]) },
      gradeOverride: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockReturnValue('upsert'),
        delete: jest.fn().mockResolvedValue({}),
      },
      gradeOverrideHistory: {
        create: jest.fn().mockReturnValue('history'),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    service = new GradebookService(
      prisma,
      {
        getProgress: jest.fn().mockResolvedValue({ percent: 0 }),
        getProgressMany: jest.fn().mockResolvedValue(new Map()),
      } as any,
      notifications as any,
    );
  });

  const dto = {
    userId: 1,
    itemKey: 'assignment-10',
    value: 40,
    reason: 'Апеляція',
  };

  it('the owner and an assistant may override; history + notification', async () => {
    await service.setOverride(5, owner, dto);
    await service.setOverride(5, assistant, dto);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    const historyArg = prisma.gradeOverrideHistory.create.mock.calls[0][0].data;
    expect(historyArg).toMatchObject({
      itemKey: 'assignment-10',
      oldValue: null, // nothing graded yet
      newValue: 40,
      reason: 'Апеляція',
      changedById: 7,
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        type: 'GRADE_UPDATED',
        link: '/courses/5/grades',
      }),
    );
  });

  it('a student outside the team gets 403', async () => {
    await expect(service.setOverride(5, stranger, dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects unknown items, out-of-range values and short reasons', async () => {
    await expect(
      service.setOverride(5, owner, { ...dto, itemKey: 'assignment-99' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setOverride(5, owner, { ...dto, value: 51 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setOverride(5, owner, { ...dto, itemKey: 'final', value: 101 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setOverride(5, owner, { ...dto, reason: '  ok ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('clearing writes history with the computed value and notifies', async () => {
    prisma.gradeOverride.findUnique.mockResolvedValue({ id: 3, value: 40 });
    await service.clearOverride(5, owner, 1, 'assignment-10');
    expect(prisma.gradeOverride.delete).toHaveBeenCalledWith({
      where: { id: 3 },
    });
    expect(
      prisma.gradeOverrideHistory.create.mock.calls[0][0].data,
    ).toMatchObject({
      oldValue: 40,
      newValue: null,
      reason: 'Reset to automatic',
    });
    expect(notifications.notify).toHaveBeenCalled();
  });

  it('clearing a missing override is 404', async () => {
    await expect(
      service.clearOverride(5, owner, 1, 'final'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CoursesService.update grading scale', () => {
  const course = {
    id: 1,
    teacherId: 7,
    title: 'C',
    price: 0,
    testsWeight: 50,
    assignmentsWeight: 50,
    gradePassThreshold: 60,
    gradingScale: 'PERCENT',
    gradingScaleConfig: null,
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

  it('saves a scale with valid custom thresholds', async () => {
    const bands = JSON.stringify(
      DEFAULT_ECTS.map((b) => (b.code === 'A' ? { ...b, min: 95 } : b)),
    );
    const res: any = await service.update(
      1,
      { gradingScale: 'ECTS', gradingScaleConfig: bands },
      teacher,
    );
    expect(res.gradingScale).toBe('ECTS');
    expect(res.gradingScaleConfig[0]).toEqual({ code: 'A', min: 95 });
  });

  it('rejects invalid thresholds and broken JSON', async () => {
    await expect(
      service.update(
        1,
        { gradingScale: 'ECTS', gradingScaleConfig: '[{"code":"A","min":90}]' },
        teacher,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update(
        1,
        { gradingScale: 'ECTS', gradingScaleConfig: '{nope' },
        teacher,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
