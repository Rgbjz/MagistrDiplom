import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { NotificationType, Prisma } from '@prisma/client';
import { RedisService } from '../../common/redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { render, type LocalizedText } from '../../common/i18n';

/** At most one "new message" email per conversation per recipient in this window. */
export const MESSAGE_EMAIL_THROTTLE_MS = 15 * 60 * 1000;

export type NotificationFilter =
  | 'all'
  | 'unread'
  | 'courses'
  | 'tests'
  | 'messages';

/**
 * Title/body may be plain strings or LocalizedText; LocalizedText is rendered
 * in each recipient's language (UserProfile.locale) when the row is created.
 */
export interface NotificationInput {
  type: NotificationType;
  title: string | LocalizedText;
  body?: string | LocalizedText | null;
  link?: string | null;
}

interface RenderedNotification {
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
}

const FILTER_TYPES: Record<string, NotificationType[]> = {
  courses: [
    'ENROLLMENT_REQUEST',
    'ENROLLMENT_APPROVED',
    'ENROLLMENT_REJECTED',
    'NEW_LESSON',
    'PAYMENT',
    'CERTIFICATE',
    'COURSE_STAFF_ADDED',
  ],
  tests: [
    'TEST_RESULT',
    'ASSIGNMENT_SUBMITTED',
    'ASSIGNMENT_GRADED',
    'DEADLINE_REMINDER',
    'GRADE_UPDATED',
  ],
  messages: ['NEW_MESSAGE'],
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  /** `${userId}|${link}` → last NEW_MESSAGE email time (ms). */
  private readonly lastMessageEmail = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    @Optional() private redis?: RedisService,
  ) {}

  async notify(userId: number, input: NotificationInput) {
    const locales = await this.localesOf([userId]);
    const data = this.renderFor(input, locales.get(userId));
    const notification = await this.prisma.notification.create({
      data: { userId, ...data },
    });
    this.emailRecipients([userId], input);
    return notification;
  }

  async notifyMany(userIds: number[], input: NotificationInput) {
    if (userIds.length === 0) return;
    const locales = await this.localesOf(userIds);
    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        ...this.renderFor(input, locales.get(userId)),
      })),
    });
    this.emailRecipients(userIds, input);
  }

  private renderFor(
    input: NotificationInput,
    locale: string | undefined,
  ): RenderedNotification {
    return {
      type: input.type,
      title: render(input.title, locale),
      body: render(input.body, locale),
      link: input.link ?? null,
    };
  }

  /** userId → saved interface language (missing profile → default). */
  private async localesOf(userIds: number[]): Promise<Map<number, string>> {
    const profiles = await this.prisma.userProfile.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, locale: true },
    });
    return new Map(profiles.map((p) => [p.userId, p.locale]));
  }

  /**
   * Whether a NEW_MESSAGE email may go out now; records the send if so.
   * With Redis the window is shared by all instances (SET NX PX).
   */
  async shouldEmailMessage(
    userId: number,
    link: string | null | undefined,
    now = Date.now(),
  ): Promise<boolean> {
    const key = `${userId}|${link ?? ''}`;
    const client = this.redis?.client;
    if (client) {
      const set = await client.set(
        `mail-throttle:message:${key}`,
        String(now),
        'PX',
        MESSAGE_EMAIL_THROTTLE_MS,
        'NX',
      );
      return set === 'OK';
    }
    const last = this.lastMessageEmail.get(key);
    if (last !== undefined && now - last < MESSAGE_EMAIL_THROTTLE_MS) {
      return false;
    }
    this.lastMessageEmail.set(key, now);
    return true;
  }

  /** Background email fan-out; failures never affect the caller. */
  private emailRecipients(userIds: number[], input: NotificationInput) {
    void this.sendEmails(userIds, input).catch((err: unknown) => {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Notification email failed: ${reason}`);
    });
  }

  private async sendEmails(userIds: number[], input: NotificationInput) {
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        emailVerified: true,
        blocked: false,
        profile: { is: { emailNotifications: true } },
      },
      select: { id: true, email: true, profile: { select: { locale: true } } },
    });
    for (const user of users) {
      if (
        input.type === 'NEW_MESSAGE' &&
        !(await this.shouldEmailMessage(user.id, input.link))
      ) {
        continue;
      }
      const locale = user.profile?.locale;
      const text = this.renderFor(input, locale);
      this.mail.sendNotification(user.email, text, locale);
    }
  }

  list(userId: number, filter: NotificationFilter = 'all') {
    const where: Prisma.NotificationWhereInput = { userId };
    if (filter === 'unread') {
      where.readAt = null;
    } else if (FILTER_TYPES[filter]) {
      where.type = { in: FILTER_TYPES[filter] };
    }
    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        link: true,
        readAt: true,
        createdAt: true,
      },
    });
  }

  async unreadCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  async markRead(id: number, userId: number) {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n || n.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }
    if (!n.readAt) {
      await this.prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
    }
  }

  async markAllRead(userId: number) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
