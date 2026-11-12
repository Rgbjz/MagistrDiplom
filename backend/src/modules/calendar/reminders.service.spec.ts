/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- loose Prisma mocks */
import {
  RemindersService,
  OFFSETS,
  SCHEDULE_WINDOW_MS,
} from './reminders.service';

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);

function setup() {
  const prisma: any = {
    assignment: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    courseEvent: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    enrollment: { findMany: jest.fn().mockResolvedValue([]) },
    userProfile: { findMany: jest.fn().mockResolvedValue([]) },
    courseStaff: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const queue: any = {
    register: jest.fn(),
    enqueue: jest.fn().mockResolvedValue(undefined),
  };
  const notifications: any = {
    notifyMany: jest.fn().mockResolvedValue(undefined),
  };
  const service = new RemindersService(prisma, queue, notifications);
  return { prisma, queue, notifications, service };
}

describe('RemindersService scheduling', () => {
  it('queues 24 h and 1 h jobs with ids keyed by the deadline', async () => {
    const { service, queue } = setup();
    const at = new Date(NOW + 48 * HOUR);
    await service.schedule('assignment', 5, at, NOW);
    expect(queue.enqueue).toHaveBeenCalledTimes(2);
    const [, , data24, opts24] = queue.enqueue.mock.calls[0];
    expect(data24).toEqual({
      kind: 'assignment',
      id: 5,
      at: at.getTime(),
      offset: '24h',
    });
    expect(opts24).toEqual({
      delay: 48 * HOUR - OFFSETS['24h'],
      jobId: `deadline-assignment-5-24h-${at.getTime()}`,
    });
    expect(queue.enqueue.mock.calls[1][3].delay).toBe(47 * HOUR);
  });

  it('skips reminders already in the past and those beyond the window', async () => {
    const { service, queue } = setup();
    await service.schedule('event', 1, new Date(NOW + 2 * HOUR), NOW); // only 1 h left
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(queue.enqueue.mock.calls[0][2].offset).toBe('1h');
    queue.enqueue.mockClear();
    await service.schedule(
      'event',
      1,
      new Date(NOW + SCHEDULE_WINDOW_MS + 2 * OFFSETS['24h']),
      NOW,
    );
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('a moved deadline gets new job ids (old jobs become stale)', async () => {
    const { service, queue } = setup();
    await service.schedule('assignment', 9, new Date(NOW + 30 * HOUR), NOW);
    await service.schedule('assignment', 9, new Date(NOW + 40 * HOUR), NOW);
    const ids = queue.enqueue.mock.calls.map((c: any[]) => c[3].jobId);
    expect(new Set(ids).size).toBe(4);
  });

  it('reconcile schedules every upcoming assignment and event', async () => {
    const { service, prisma, queue } = setup();
    prisma.assignment.findMany.mockResolvedValue([
      { id: 1, dueAt: new Date(NOW + 30 * HOUR) },
    ]);
    prisma.courseEvent.findMany.mockResolvedValue([
      { id: 2, startsAt: new Date(NOW + 3 * HOUR) },
    ]);
    expect(await service.reconcile(NOW)).toBe(2);
    expect(queue.enqueue).toHaveBeenCalledTimes(3); // 2 for the assignment, 1 (1 h) for the event
  });
});

describe('RemindersService execution', () => {
  const due = new Date(NOW + HOUR);
  const assignment = {
    id: 7,
    title: 'Звіт',
    dueAt: due,
    lesson: { section: { course: { id: 3, title: 'Веб', published: true } } },
    submissions: [{ userId: 11 }],
  };

  it('reminds enrolled students who have not handed in and opted in', async () => {
    const { service, prisma, notifications } = setup();
    prisma.assignment.findUnique.mockResolvedValue(assignment);
    prisma.enrollment.findMany.mockResolvedValue([
      { userId: 10 },
      { userId: 11 },
      { userId: 12 },
    ]);
    prisma.userProfile.findMany.mockResolvedValue([{ userId: 12 }]); // switched off
    const n = await service.process({
      kind: 'assignment',
      id: 7,
      at: due.getTime(),
      offset: '1h',
    });
    expect(n).toBe(1);
    const [ids, input] = notifications.notifyMany.mock.calls[0];
    expect(ids).toEqual([10]);
    expect(input.type).toBe('DEADLINE_REMINDER');
    expect(input.title.key).toBe('notify.reminder.assignment1h');
    expect(input.link).toBe('/courses/3?assignment=7');
  });

  it('does nothing for a stale job (deadline moved) or a deleted item', async () => {
    const { service, prisma, notifications } = setup();
    prisma.assignment.findUnique.mockResolvedValue({
      ...assignment,
      dueAt: new Date(NOW + 5 * HOUR),
    });
    expect(
      await service.process({
        kind: 'assignment',
        id: 7,
        at: due.getTime(),
        offset: '1h',
      }),
    ).toBe(0);
    prisma.assignment.findUnique.mockResolvedValue(null);
    expect(
      await service.process({
        kind: 'assignment',
        id: 7,
        at: due.getTime(),
        offset: '1h',
      }),
    ).toBe(0);
    expect(notifications.notifyMany).not.toHaveBeenCalled();
  });

  it('event reminders go to students and the course team', async () => {
    const { service, prisma, notifications } = setup();
    prisma.courseEvent.findUnique.mockResolvedValue({
      id: 4,
      title: 'Лекція',
      startsAt: due,
      course: { id: 3, title: 'Веб', teacherId: 1, published: true },
    });
    prisma.enrollment.findMany.mockResolvedValue([{ userId: 10 }]);
    prisma.courseStaff.findMany.mockResolvedValue([{ userId: 2 }]);
    const n = await service.process({
      kind: 'event',
      id: 4,
      at: due.getTime(),
      offset: '24h',
    });
    expect(n).toBe(3);
    const [ids, input] = notifications.notifyMany.mock.calls[0];
    expect(ids.sort()).toEqual([1, 10, 2].sort());
    expect(input.title.key).toBe('notify.reminder.event24h');
  });
});
