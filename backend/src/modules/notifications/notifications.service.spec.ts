/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- loose Prisma mocks */
import { NotFoundException } from '@nestjs/common';
import {
  MESSAGE_EMAIL_THROTTLE_MS,
  NotificationsService,
} from './notifications.service';
import { msg } from '../../common/i18n';

describe('NotificationsService', () => {
  let prisma: any;
  let service: NotificationsService;
  let mail: any;

  beforeEach(() => {
    prisma = {
      notification: {
        count: jest.fn().mockResolvedValue(3),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 5, email: 'a@b.c', profile: { locale: 'uk' } },
          ]),
      },
      userProfile: {
        findMany: jest.fn().mockResolvedValue([{ userId: 5, locale: 'uk' }]),
      },
    };
    mail = { sendNotification: jest.fn() };
    service = new NotificationsService(prisma, mail);
  });

  it('counts only unread notifications of the user', async () => {
    await expect(service.unreadCount(5)).resolves.toEqual({ count: 3 });
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: 5, readAt: null },
    });
  });

  it('marks every unread notification of the user as read', async () => {
    await service.markAllRead(5);
    const args = prisma.notification.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: 5, readAt: null });
    expect(args.data.readAt).toBeInstanceOf(Date);
  });

  it("does not let a user mark someone else's notification", async () => {
    prisma.notification.findUnique.mockResolvedValue({
      id: 1,
      userId: 9,
      readAt: null,
    });
    await expect(service.markRead(1, 5)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('maps filters to notification types', async () => {
    await service.list(5, 'tests');
    expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({
      userId: 5,
      type: {
        in: [
          'TEST_RESULT',
          'ASSIGNMENT_SUBMITTED',
          'ASSIGNMENT_GRADED',
          'DEADLINE_REMINDER',
          'GRADE_UPDATED',
        ],
      },
    });
    await service.list(5, 'unread');
    expect(prisma.notification.findMany.mock.calls[1][0].where).toEqual({
      userId: 5,
      readAt: null,
    });
  });

  it('skips createMany for an empty audience', async () => {
    await service.notifyMany([], { type: 'NEW_LESSON', title: 'x' });
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('emails only verified, opted-in, unblocked recipients', async () => {
    await service.notify(5, { type: 'PAYMENT', title: 'Оплата', link: '/x' });
    await new Promise((r) => setImmediate(r));
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      id: { in: [5] },
      emailVerified: true,
      blocked: false,
      profile: { is: { emailNotifications: true } },
    });
    expect(mail.sendNotification).toHaveBeenCalledWith(
      'a@b.c',
      { type: 'PAYMENT', title: 'Оплата', body: null, link: '/x' },
      'uk',
    );
  });

  it('renders localized titles in each recipient language', async () => {
    prisma.userProfile.findMany.mockResolvedValue([
      { userId: 1, locale: 'uk' },
      { userId: 2, locale: 'en' },
      { userId: 3, locale: 'pl' },
    ]);
    await service.notifyMany([1, 2, 3, 4], {
      type: 'NEW_LESSON',
      title: msg('notify.newLesson.title', { course: 'Git' }),
      body: msg('notify.newLesson.body', { section: 'Intro' }),
      link: '/courses/1',
    });
    const rows = prisma.notification.createMany.mock.calls[0][0].data;
    expect(rows.map((r: { title: string }) => r.title)).toEqual([
      'У курсі «Git» новий урок',
      'New lesson in “Git”',
      'Nowa lekcja w kursie „Git”',
      'У курсі «Git» новий урок', // no profile → default language
    ]);
    expect(rows[1].body).toBe('Section “Intro”');
  });

  it('emails in the recipient language', async () => {
    prisma.userProfile.findMany.mockResolvedValue([
      { userId: 5, locale: 'pl' },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 5, email: 'a@b.c', profile: { locale: 'pl' } },
    ]);
    await service.notify(5, {
      type: 'PAYMENT',
      title: msg('notify.payment.title', { course: 'SQL' }),
      body: msg('notify.payment.body', { amount: 900 }),
    });
    await new Promise((r) => setImmediate(r));
    expect(prisma.notification.create.mock.calls[0][0].data.title).toBe(
      'Płatność za kurs „SQL” potwierdzona',
    );
    expect(mail.sendNotification).toHaveBeenCalledWith(
      'a@b.c',
      expect.objectContaining({ title: 'Płatność za kurs „SQL” potwierdzona' }),
      'pl',
    );
  });

  it('throttles new-message emails per conversation for 15 minutes', async () => {
    const t0 = 1_000_000;
    expect(await service.shouldEmailMessage(5, '/chat?c=1', t0)).toBe(true);
    expect(await service.shouldEmailMessage(5, '/chat?c=1', t0 + 60_000)).toBe(
      false,
    );
    expect(await service.shouldEmailMessage(5, '/chat?c=2', t0 + 60_000)).toBe(
      true,
    );
    expect(await service.shouldEmailMessage(6, '/chat?c=1', t0 + 60_000)).toBe(
      true,
    );
    expect(
      await service.shouldEmailMessage(
        5,
        '/chat?c=1',
        t0 + MESSAGE_EMAIL_THROTTLE_MS,
      ),
    ).toBe(true);
  });

  it('uses Redis SET NX PX for the throttle when Redis is configured', async () => {
    const set = jest
      .fn()
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(null);
    const withRedis = new NotificationsService(prisma, mail, {
      client: { set },
    } as never);
    expect(await withRedis.shouldEmailMessage(7, '/chat?c=9')).toBe(true);
    expect(await withRedis.shouldEmailMessage(7, '/chat?c=9')).toBe(false);
    expect(set).toHaveBeenCalledWith(
      'mail-throttle:message:7|/chat?c=9',
      expect.any(String),
      'PX',
      MESSAGE_EMAIL_THROTTLE_MS,
      'NX',
    );
  });

  it('sends a single new-message email within the throttle window', async () => {
    const input = {
      type: 'NEW_MESSAGE' as const,
      title: 'Msg',
      link: '/chat?c=3',
    };
    await service.notify(5, input);
    await service.notify(5, input);
    await new Promise((r) => setImmediate(r));
    expect(mail.sendNotification).toHaveBeenCalledTimes(1);
  });
});
