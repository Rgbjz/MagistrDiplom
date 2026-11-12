/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment -- loose Prisma mocks */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AssignmentsService } from './assignments.service';

const teacher = { id: 7, role: 'TEACHER' as const, email: 't@x.io' };
const otherTeacher = { id: 8, role: 'TEACHER' as const, email: 'o@x.io' };
const student = { id: 20, role: 'STUDENT' as const, email: 's@x.io' };

function assignment(over: Record<string, unknown> = {}) {
  return {
    id: 5,
    lessonId: 3,
    title: 'Верстка картки',
    dueAt: null as Date | null,
    maxScore: 100,
    maxFiles: 2,
    lesson: {
      title: 'Flexbox',
      section: { course: { id: 1, title: 'Web', teacherId: 7 } },
    },
    ...over,
  };
}

function file(name = 'work.pdf'): Express.Multer.File {
  return {
    originalname: name,
    mimetype: 'application/pdf',
    size: 10,
    buffer: Buffer.from('x'),
  } as Express.Multer.File;
}

describe('AssignmentsService', () => {
  let prisma: any;
  let storage: { save: jest.Mock; remove: jest.Mock };
  let notifications: { notify: jest.Mock; notifyMany: jest.Mock };
  let service: AssignmentsService;

  beforeEach(() => {
    const tx = {
      submissionFile: { deleteMany: jest.fn() },
      submission: {
        create: jest.fn(({ data }: { data: object }) => ({ id: 1, ...data })),
        update: jest.fn(({ data }: { data: object }) => ({ id: 1, ...data })),
      },
    };
    prisma = {
      tx,
      course: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, teacherId: 7 }),
      },
      courseStaff: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },

      assignment: { findUnique: jest.fn().mockResolvedValue(assignment()) },
      enrollment: {
        findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      },
      submission: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(({ data }: { data: object }) => ({ id: 9, ...data })),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ email: 's@x.io', profile: null }),
      },
      $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    };
    storage = {
      save: jest.fn().mockResolvedValue('/public/submissions/a.pdf'),
      remove: jest.fn(),
    };
    notifications = { notify: jest.fn(), notifyMany: jest.fn() };
    service = new AssignmentsService(
      prisma,
      notifications as any,
      storage as any,
    );
  });

  describe('submit', () => {
    it('creates a submission, stores files and notifies the teacher', async () => {
      await service.submit(
        5,
        [file(), file('конспект.md')],
        ' готово ',
        student,
      );
      expect(storage.save).toHaveBeenCalledTimes(2);
      const created = prisma.tx.submission.create.mock.calls[0][0].data;
      expect(created).toMatchObject({
        assignmentId: 5,
        userId: 20,
        comment: 'готово',
        status: 'SUBMITTED',
        late: false,
      });
      expect(created.files.create).toHaveLength(2);
      expect(notifications.notifyMany).toHaveBeenCalledWith(
        [7],
        expect.objectContaining({ type: 'ASSIGNMENT_SUBMITTED' }),
      );
    });

    it('flags submissions after the deadline as late', async () => {
      prisma.assignment.findUnique.mockResolvedValue(
        assignment({ dueAt: new Date(Date.now() - 60_000) }),
      );
      await service.submit(5, [file()], undefined, student);
      expect(prisma.tx.submission.create.mock.calls[0][0].data.late).toBe(true);
    });

    it('replaces files on resubmission and removes the old ones', async () => {
      prisma.submission.findUnique.mockResolvedValue({
        id: 1,
        status: 'RETURNED',
        files: [{ url: '/public/submissions/old.pdf' }],
      });
      await service.submit(5, [file()], undefined, student);
      expect(prisma.tx.submissionFile.deleteMany).toHaveBeenCalledWith({
        where: { submissionId: 1 },
      });
      expect(prisma.tx.submission.update.mock.calls[0][0].data.status).toBe(
        'SUBMITTED',
      );
      expect(storage.remove).toHaveBeenCalledWith(
        '/public/submissions/old.pdf',
      );
    });

    it('locks graded submissions', async () => {
      prisma.submission.findUnique.mockResolvedValue({
        id: 1,
        status: 'GRADED',
        files: [],
      });
      await expect(
        service.submit(5, [file()], undefined, student),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('enforces maxFiles and requires at least one file', async () => {
      await expect(
        service.submit(5, [file(), file(), file()], undefined, student),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.submit(5, [], undefined, student),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects students who are not actively enrolled', async () => {
      prisma.enrollment.findUnique.mockResolvedValue({ status: 'PENDING' });
      await expect(
        service.submit(5, [file()], undefined, student),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('grade', () => {
    beforeEach(() => {
      prisma.submission.findUnique.mockResolvedValue({
        id: 9,
        userId: 20,
        assignment: assignment(),
      });
    });

    it('grades within bounds and notifies the student', async () => {
      const res = await service.grade(
        9,
        { score: 85, feedback: 'Добре' },
        teacher,
      );
      expect(res).toMatchObject({
        status: 'GRADED',
        score: 85,
        feedback: 'Добре',
      });
      expect(notifications.notify).toHaveBeenCalledWith(
        20,
        expect.objectContaining({ type: 'ASSIGNMENT_GRADED' }),
      );
    });

    it('rejects scores above maxScore', async () => {
      await expect(
        service.grade(9, { score: 101 }, teacher),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('only the course teacher can grade', async () => {
      await expect(
        service.grade(9, { score: 50 }, otherTeacher),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returning for revision clears the score', async () => {
      const res = await service.returnForRevision(
        9,
        { feedback: 'Додайте адаптивність' },
        teacher,
      );
      expect(res).toMatchObject({ status: 'RETURNED', score: null });
    });
  });

  it('404s for an unknown assignment', async () => {
    prisma.assignment.findUnique.mockResolvedValue(null);
    await expect(service.getOne(99, teacher)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
