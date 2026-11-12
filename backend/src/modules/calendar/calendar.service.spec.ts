/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- loose Prisma mocks */
import { ForbiddenException } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { signCalendarToken } from './calendar-token';

const config: any = {
  get: (k: string) =>
    ({
      CALENDAR_SECRET: 'sec',
      API_PUBLIC_URL: 'http://api/api',
      APP_URL: 'http://app',
    })[k],
};

function setup() {
  const prisma: any = {
    enrollment: { findMany: jest.fn().mockResolvedValue([]) },
    course: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
    courseStaff: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    assignment: { findMany: jest.fn().mockResolvedValue([]) },
    courseEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    userProfile: { findUnique: jest.fn(), upsert: jest.fn() },
  };
  const reminders: any = { scheduleEvent: jest.fn() };
  return {
    prisma,
    reminders,
    service: new CalendarService(prisma, config, reminders),
  };
}

const student = { id: 10, role: 'STUDENT' as const };

describe('CalendarService.forUser', () => {
  it('shows a student their assignments with done flags and course events', async () => {
    const { service, prisma } = setup();
    prisma.enrollment.findMany.mockResolvedValue([
      { course: { id: 3, title: 'Веб' } },
    ]);
    prisma.assignment.findMany.mockResolvedValue([
      {
        id: 1,
        title: 'A',
        dueAt: new Date('2026-11-20T10:00:00Z'),
        lesson: { section: { courseId: 3 } },
        submissions: [{ status: 'GRADED' }],
      },
      {
        id: 2,
        title: 'B',
        dueAt: new Date('2026-11-21T10:00:00Z'),
        lesson: { section: { courseId: 3 } },
        submissions: [{ status: 'RETURNED' }],
      },
    ]);
    prisma.courseEvent.findMany.mockResolvedValue([
      {
        id: 5,
        courseId: 3,
        title: 'Лекція',
        description: null,
        kind: 'LECTURE',
        startsAt: new Date('2026-11-19T10:00:00Z'),
        endsAt: null,
      },
    ]);
    const res = await service.forUser(
      student,
      '2026-11-01T00:00:00Z',
      '2026-12-01T00:00:00Z',
    );
    expect(res.items.map((i) => i.id)).toEqual([
      'event-5',
      'assignment-1',
      'assignment-2',
    ]);
    expect(res.items[1]).toMatchObject({
      done: true,
      role: 'student',
      link: '/courses/3?assignment=1',
    });
    expect(res.items[2].done).toBe(false); // returned for revision
    expect(res.items[0].canEdit).toBe(false);
    expect(res.canCreateIn).toEqual([]);
    // only the user's own submissions are loaded
    expect(
      prisma.assignment.findMany.mock.calls[0][0].select.submissions.where,
    ).toEqual({ userId: 10 });
  });

  it('gives the course team edit rights and a manage link', async () => {
    const { service, prisma } = setup();
    prisma.courseStaff.findMany.mockResolvedValue([
      { role: 'ASSISTANT', course: { id: 4, title: 'SQL' } },
    ]);
    prisma.course.findMany.mockResolvedValue([{ id: 3, title: 'Веб' }]);
    prisma.assignment.findMany.mockResolvedValue([
      {
        id: 1,
        title: 'A',
        dueAt: new Date('2026-11-20T10:00:00Z'),
        lesson: { section: { courseId: 3 } },
        submissions: [],
      },
    ]);
    prisma.courseEvent.findMany.mockResolvedValue([
      {
        id: 6,
        courseId: 4,
        title: 'E',
        description: null,
        kind: 'OTHER',
        startsAt: new Date('2026-11-22T10:00:00Z'),
        endsAt: null,
      },
    ]);
    const res = await service.forUser(
      { id: 1, role: 'TEACHER' },
      '2026-11-01T00:00:00Z',
      '2026-12-01T00:00:00Z',
    );
    expect(res.items[0]).toMatchObject({
      role: 'staff',
      done: null,
      link: '/courses/3/manage?tab=assignments',
    });
    expect(res.items[1].canEdit).toBe(false); // assistant: no content permission
    expect(res.canCreateIn).toMatchObject([{ id: 3, title: 'Веб' }]);
    expect(res.canCreateIn).toHaveLength(1);
  });

  it('rejects an inverted or too long range', async () => {
    const { service } = setup();
    await expect(
      service.forUser(student, '2026-12-01T00:00:00Z', '2026-11-01T00:00:00Z'),
    ).rejects.toThrow();
    await expect(
      service.forUser(student, '2025-01-01T00:00:00Z', '2027-01-01T00:00:00Z'),
    ).rejects.toThrow();
  });
});

describe('CalendarService events and feed', () => {
  it('only the course team with content rights creates events; reminders get scheduled', async () => {
    const { service, prisma, reminders } = setup();
    prisma.course.findUnique.mockResolvedValue({ id: 3, teacherId: 1 });
    await expect(
      service.createEvent(
        3,
        { title: 'X', startsAt: '2026-11-20T10:00:00Z' },
        { id: 99, role: 'TEACHER', email: '' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    prisma.courseEvent.create.mockResolvedValue({ id: 8 });
    await service.createEvent(
      3,
      { title: ' Лекція ', kind: 'LECTURE', startsAt: '2026-11-20T10:00:00Z' },
      { id: 1, role: 'TEACHER', email: '' },
    );
    expect(prisma.courseEvent.create.mock.calls[0][0].data).toMatchObject({
      title: 'Лекція',
      kind: 'LECTURE',
      createdById: 1,
    });
    expect(reminders.scheduleEvent).toHaveBeenCalledWith(8);
  });

  it('feed URL uses the token version; a revoked token gets no feed', async () => {
    const { service, prisma } = setup();
    prisma.userProfile.findUnique.mockResolvedValue({
      calendarTokenVersion: 2,
    });
    const { url } = await service.feedUrl(10);
    expect(url).toBe(
      `http://api/api/calendar/ical/${signCalendarToken('sec', 10, 2)}.ics`,
    );

    prisma.user.findUnique.mockResolvedValue({
      id: 10,
      role: 'STUDENT',
      blocked: false,
      profile: { calendarTokenVersion: 3, locale: 'en' },
    });
    expect(await service.feed(signCalendarToken('sec', 10, 2))).toBeNull();

    prisma.user.findUnique.mockResolvedValue({
      id: 10,
      role: 'STUDENT',
      blocked: false,
      profile: { calendarTokenVersion: 2, locale: 'en' },
    });
    prisma.enrollment.findMany.mockResolvedValue([
      { course: { id: 3, title: 'Web' } },
    ]);
    prisma.courseEvent.findMany.mockResolvedValue([
      {
        id: 5,
        courseId: 3,
        title: 'Talk',
        description: 'a;b',
        kind: 'LECTURE',
        startsAt: new Date(Date.now() + 86400000),
        endsAt: null,
      },
    ]);
    const body = await service.feed(`${signCalendarToken('sec', 10, 2)}.ics`);
    expect(body).toContain('X-WR-CALNAME:LMS — my calendar');
    expect(body).toContain('SUMMARY:Lecture: Talk (Web)');
    expect(body).toContain('DESCRIPTION:a\\;b');
    expect(body).toContain('URL:http://app/courses/3');
  });
});
