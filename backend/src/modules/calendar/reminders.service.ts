import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { courseStaffIds } from '../../common/access/course-access';
import { msg, type MessageKey } from '../../common/i18n';
import { NotificationsService } from '../notifications/notifications.service';

export const REMINDER_QUEUE = 'reminders';
export const REMINDER_JOB = 'deadline';

export type ReminderKind = 'assignment' | 'event';
export type ReminderOffset = '24h' | '1h';

export const OFFSETS: Record<ReminderOffset, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '1h': 60 * 60 * 1000,
};

/**
 * Jobs are only queued for reminders due within this window; a periodic
 * reconciliation queues the rest as they come closer. Keeps delays short
 * (the in-process fallback uses setTimeout, capped at ~24.8 days).
 */
export const SCHEDULE_WINDOW_MS = 8 * 24 * 60 * 60 * 1000;
const RECONCILE_EVERY_MS = 6 * 60 * 60 * 1000;

export interface ReminderJob {
  kind: ReminderKind;
  id: number;
  /** The deadline / start the job was scheduled for (ms). A changed date makes the job stale. */
  at: number;
  offset: ReminderOffset;
}

/** dd.MM.yyyy HH:mm in Kyiv time — locale-neutral for the notification body. */
function kyivDate(d: Date): string {
  const parts = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}

/**
 * Deadline reminders, 24 h and 1 h before assignment deadlines and course
 * events. Job ids include the target timestamp, so moving a deadline simply
 * schedules new jobs; the old ones find a different date when they run and do
 * nothing. Deleted items are skipped the same way.
 */
@Injectable()
export class RemindersService
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(RemindersService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private prisma: PrismaService,
    private queue: QueueService,
    private notifications: NotificationsService,
  ) {}

  onModuleInit() {
    // Light jobs (a few queries + notifications), so the API instances run
    // them even with a standalone worker (WORKER_ENABLED=false).
    this.queue.register<ReminderJob>(
      REMINDER_QUEUE,
      REMINDER_JOB,
      (job) => this.process(job).then(() => undefined),
      { inApi: true },
    );
  }

  onApplicationBootstrap() {
    // Redis may have been emptied, or the in-process fallback lost its timers
    // on restart: queue reminders for everything coming up.
    void this.reconcile().catch((err: unknown) =>
      this.logger.warn(`Reminder reconciliation failed: ${String(err)}`),
    );
    this.timer = setInterval(() => {
      void this.reconcile().catch(() => undefined);
    }, RECONCILE_EVERY_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ----------------------------------------------------------- scheduling

  async scheduleAssignment(id: number, now = Date.now()) {
    const a = await this.prisma.assignment.findUnique({
      where: { id },
      select: { dueAt: true },
    });
    if (a?.dueAt) await this.schedule('assignment', id, a.dueAt, now);
  }

  async scheduleEvent(id: number, now = Date.now()) {
    const e = await this.prisma.courseEvent.findUnique({
      where: { id },
      select: { startsAt: true },
    });
    if (e) await this.schedule('event', id, e.startsAt, now);
  }

  /** Queues the 24 h / 1 h jobs that fall inside the scheduling window. */
  async schedule(kind: ReminderKind, id: number, at: Date, now = Date.now()) {
    const target = at.getTime();
    for (const offset of Object.keys(OFFSETS) as ReminderOffset[]) {
      const delay = target - OFFSETS[offset] - now;
      if (delay <= 0 || delay > SCHEDULE_WINDOW_MS) continue;
      await this.queue.enqueue<ReminderJob>(
        REMINDER_QUEUE,
        REMINDER_JOB,
        { kind, id, at: target, offset },
        { delay, jobId: `deadline-${kind}-${id}-${offset}-${target}` },
      );
    }
  }

  /** Queues reminders for every deadline/event in the window (idempotent via job ids). */
  async reconcile(now = Date.now()): Promise<number> {
    const from = new Date(now);
    const to = new Date(now + SCHEDULE_WINDOW_MS + OFFSETS['24h']);
    const [assignments, events] = await Promise.all([
      this.prisma.assignment.findMany({
        where: { dueAt: { gt: from, lte: to } },
        select: { id: true, dueAt: true },
      }),
      this.prisma.courseEvent.findMany({
        where: { startsAt: { gt: from, lte: to } },
        select: { id: true, startsAt: true },
      }),
    ]);
    for (const a of assignments) {
      if (a.dueAt) await this.schedule('assignment', a.id, a.dueAt, now);
    }
    for (const e of events) await this.schedule('event', e.id, e.startsAt, now);
    return assignments.length + events.length;
  }

  // ------------------------------------------------------------ execution

  /** Sends one reminder; returns the number of users notified. */
  async process(job: ReminderJob): Promise<number> {
    return job.kind === 'assignment'
      ? this.remindAssignment(job)
      : this.remindEvent(job);
  }

  /**
   * Development/test helper: sends the reminder for an item right away, using
   * its current date (the controller only exposes it outside production).
   */
  async remindNow(kind: ReminderKind, id: number): Promise<number> {
    const at =
      kind === 'assignment'
        ? (
            await this.prisma.assignment.findUnique({
              where: { id },
              select: { dueAt: true },
            })
          )?.dueAt
        : (
            await this.prisma.courseEvent.findUnique({
              where: { id },
              select: { startsAt: true },
            })
          )?.startsAt;
    if (!at) return 0;
    return this.process({ kind, id, at: at.getTime(), offset: '1h' });
  }

  private async remindAssignment(job: ReminderJob): Promise<number> {
    const a = await this.prisma.assignment.findUnique({
      where: { id: job.id },
      select: {
        id: true,
        title: true,
        dueAt: true,
        lesson: {
          select: {
            section: {
              select: {
                course: { select: { id: true, title: true, published: true } },
              },
            },
          },
        },
        submissions: {
          where: { status: { in: ['SUBMITTED', 'GRADED'] } },
          select: { userId: true },
        },
      },
    });
    if (!a?.dueAt || a.dueAt.getTime() !== job.at) return 0; // deleted or moved
    const course = a.lesson.section.course;
    if (!course.published) return 0;
    const done = new Set(a.submissions.map((s) => s.userId));
    const enrolled = await this.prisma.enrollment.findMany({
      where: { courseId: course.id, status: 'ACTIVE' },
      select: { userId: true },
    });
    const recipients = await this.optedIn(
      enrolled.map((e) => e.userId).filter((id) => !done.has(id)),
    );
    const key: MessageKey =
      job.offset === '24h'
        ? 'notify.reminder.assignment24h'
        : 'notify.reminder.assignment1h';
    await this.notifications.notifyMany(recipients, {
      type: 'DEADLINE_REMINDER',
      title: msg(key, { assignment: a.title }),
      body: msg('notify.reminder.body', {
        course: course.title,
        date: kyivDate(a.dueAt),
      }),
      link: `/courses/${course.id}?assignment=${a.id}`,
    });
    return recipients.length;
  }

  private async remindEvent(job: ReminderJob): Promise<number> {
    const e = await this.prisma.courseEvent.findUnique({
      where: { id: job.id },
      include: {
        course: {
          select: { id: true, title: true, teacherId: true, published: true },
        },
      },
    });
    if (!e || e.startsAt.getTime() !== job.at) return 0;
    const enrolled = e.course.published
      ? await this.prisma.enrollment.findMany({
          where: { courseId: e.course.id, status: 'ACTIVE' },
          select: { userId: true },
        })
      : [];
    const staff = await courseStaffIds(this.prisma, e.course);
    const recipients = await this.optedIn([
      ...new Set([...enrolled.map((x) => x.userId), ...staff]),
    ]);
    const key: MessageKey =
      job.offset === '24h'
        ? 'notify.reminder.event24h'
        : 'notify.reminder.event1h';
    await this.notifications.notifyMany(recipients, {
      type: 'DEADLINE_REMINDER',
      title: msg(key, { event: e.title }),
      body: msg('notify.reminder.body', {
        course: e.course.title,
        date: kyivDate(e.startsAt),
      }),
      link: `/calendar?date=${e.startsAt.toISOString().slice(0, 10)}`,
    });
    return recipients.length;
  }

  /** Drops users who switched reminders off in their profile. */
  private async optedIn(userIds: number[]): Promise<number[]> {
    if (userIds.length === 0) return [];
    const off = await this.prisma.userProfile.findMany({
      where: { userId: { in: userIds }, deadlineReminders: false },
      select: { userId: true },
    });
    const blocked = new Set(off.map((p) => p.userId));
    return userIds.filter((id) => !blocked.has(id));
  }
}
