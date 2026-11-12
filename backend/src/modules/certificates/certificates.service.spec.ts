/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- loose Prisma mocks */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CertificatesService } from './certificates.service';

const row = {
  id: 184,
  code: 'LMS-2026-000184',
  issuedAt: new Date('2026-05-01'),
  avgScore: 91,
  user: { email: 's@x.io', profile: { firstName: 'Olena', lastName: 'K' } },
  course: {
    id: 4,
    title: 'Web',
    teacher: { email: 't@x.io', profile: null },
    sections: [{ _count: { lessons: 2 } }, { _count: { lessons: 3 } }],
  },
};

describe('CertificatesService.issue', () => {
  let prisma: any;
  let progress: { getProgress: jest.Mock };
  let notifications: { notify: jest.Mock };
  let service: CertificatesService;

  beforeEach(() => {
    prisma = {
      certificate: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValue({ id: 184, issuedAt: new Date('2026-05-01') }),
        update: jest.fn().mockResolvedValue(row),
      },
      enrollment: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, status: 'ACTIVE' }),
        update: jest.fn().mockResolvedValue({}),
      },
      testResult: {
        aggregate: jest.fn().mockResolvedValue({ _avg: { score: 90.6 } }),
      },
    };
    progress = { getProgress: jest.fn().mockResolvedValue({ percent: 100 }) };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    service = new CertificatesService(
      prisma,
      progress as any,
      notifications as any,
    );
  });

  it('returns the existing certificate without issuing a new one', async () => {
    prisma.certificate.findUnique.mockResolvedValue(row);
    const res = await service.issue(4, 1);
    expect(res.code).toBe('LMS-2026-000184');
    expect(prisma.certificate.create).not.toHaveBeenCalled();
    expect(progress.getProgress).not.toHaveBeenCalled();
  });

  it('refuses while the course is not 100% complete', async () => {
    progress.getProgress.mockResolvedValue({ percent: 80 });
    await expect(service.issue(4, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it('refuses users who are not actively enrolled', async () => {
    prisma.enrollment.findUnique.mockResolvedValue({
      id: 1,
      status: 'PENDING',
    });
    await expect(service.issue(4, 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('issues a readable code derived from the id and notifies the student', async () => {
    const res = await service.issue(4, 1);
    expect(prisma.certificate.create.mock.calls[0][0].data).toMatchObject({
      userId: 1,
      courseId: 4,
      avgScore: 91,
    });
    expect(prisma.certificate.update.mock.calls[0][0].data).toEqual({
      code: 'LMS-2026-000184',
    });
    expect(res).toMatchObject({
      code: 'LMS-2026-000184',
      student: { name: 'Olena K' },
      teacher: { name: 't@x.io' },
      course: { id: 4, title: 'Web', lessonsCount: 5 },
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ type: 'CERTIFICATE' }),
    );
  });
});
