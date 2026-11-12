import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CourseEventKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  assertCourseRole,
  can,
  type CourseRole,
} from '../../common/access/course-access';
import { t as translate } from '../../common/i18n';
import { buildIcal, type IcalEvent } from './ical';
import { parseCalendarToken, signCalendarToken } from './calendar-token';
import { RemindersService } from './reminders.service';
import type {
  CreateCourseEventDto,
  UpdateCourseEventDto,
} from './dto/event.dto';

export type CalendarItemKind = 'ASSIGNMENT' | CourseEventKind;

export interface CalendarItem {
  /** `assignment-<id>` | `event-<id>` — stable key. */
  id: string;
  kind: CalendarItemKind;
  title: string;
  description: string | null;
  courseId: number;
  courseTitle: string;
  startsAt: string;
  endsAt: string | null;
  link: string;
  /** Student view of an assignment: handed in (submitted/graded). Null otherwise. */
  done: boolean | null;
  /** How the user relates to the course. */
  role: 'student' | 'staff';
  /** Course event id (for edit/delete), null for assignments. */
  eventId: number | null;
  /** The user may edit/delete this event. */
  canEdit: boolean;
}

export interface CalendarResponse {
  from: string;
  to: string;
  items: CalendarItem[];
  courses: { id: number; title: string }[];
  /** Courses where the user may add events (drafts flagged for the picker). */
  canCreateIn: {
    id: number;
    title: string;
    published: boolean;
    updatedAt: string | null;
  }[];
}

interface CourseLink {
  title: string;
  published?: boolean;
  updatedAt?: Date;
  /** Null → student (enrolled). */
  staffRole: CourseRole | null;
}

const DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE = 400 * DAY;

@Injectable()
export class CalendarService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @Optional() private reminders?: RemindersService,
  ) {}

  // ------------------------------------------------------------ calendar

  async forUser(
    user: Pick<AuthUser, 'id' | 'role'>,
    fromIso?: string,
    toIso?: string,
  ): Promise<CalendarResponse> {
    const now = Date.now();
    const from = fromIso ? new Date(fromIso) : new Date(now - 7 * DAY);
    const to = toIso ? new Date(toIso) : new Date(now + 60 * DAY);
    if (to <= from || to.getTime() - from.getTime() > MAX_RANGE) {
      throw new BadRequestException('Invalid calendar range');
    }
    const courses = await this.coursesOf(user);
    const items = await this.items(user.id, courses, from, to);
    const list = [...courses.entries()]
      .map(([id, c]) => ({ id, title: c.title }))
      .sort((a, b) => a.title.localeCompare(b.title, 'uk'));
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      items,
      courses: list,
      canCreateIn: list
        .filter((c) => can(courses.get(c.id)!.staffRole, 'content'))
        .map((c) => {
          const link = courses.get(c.id)!;
          return {
            ...c,
            published: link.published !== false,
            updatedAt: link.updatedAt?.toISOString() ?? null,
          };
        }),
    };
  }

  /** Courses the user studies (ACTIVE/COMPLETED) or teaches; staff role wins. */
  private async coursesOf(
    user: Pick<AuthUser, 'id' | 'role'>,
  ): Promise<Map<number, CourseLink>> {
    const [enrollments, owned, staff] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { userId: user.id, status: { in: ['ACTIVE', 'COMPLETED'] } },
        select: { course: { select: { id: true, title: true } } },
      }),
      this.prisma.course.findMany({
        where: { teacherId: user.id },
        select: { id: true, title: true, published: true, updatedAt: true },
      }),
      this.prisma.courseStaff.findMany({
        where: { userId: user.id },
        select: {
          role: true,
          course: {
            select: { id: true, title: true, published: true, updatedAt: true },
          },
        },
      }),
    ]);
    const map = new Map<number, CourseLink>();
    for (const e of enrollments) {
      map.set(e.course.id, { title: e.course.title, staffRole: null });
    }
    for (const s of staff) {
      const { title, published, updatedAt } = s.course;
      map.set(s.course.id, { title, published, updatedAt, staffRole: s.role });
    }
    for (const c of owned)
      map.set(c.id, {
        title: c.title,
        published: c.published,
        updatedAt: c.updatedAt,
        staffRole: 'OWNER',
      });
    if (user.role === 'ADMIN') {
      for (const [id, c] of map) map.set(id, { ...c, staffRole: 'ADMIN' });
    }
    return map;
  }

  private async items(
    userId: number,
    courses: Map<number, CourseLink>,
    from: Date,
    to: Date,
  ): Promise<CalendarItem[]> {
    const ids = [...courses.keys()];
    if (ids.length === 0) return [];
    const [assignments, events] = await Promise.all([
      this.prisma.assignment.findMany({
        where: {
          dueAt: { gte: from, lte: to },
          lesson: { section: { courseId: { in: ids } } },
        },
        select: {
          id: true,
          title: true,
          dueAt: true,
          lesson: { select: { section: { select: { courseId: true } } } },
          submissions: {
            where: { userId },
            select: { status: true },
          },
        },
      }),
      this.prisma.courseEvent.findMany({
        where: {
          courseId: { in: ids },
          OR: [
            { startsAt: { gte: from, lte: to } },
            { startsAt: { lt: from }, endsAt: { gte: from } },
          ],
        },
      }),
    ]);

    const out: CalendarItem[] = [];
    for (const a of assignments) {
      const courseId = a.lesson.section.courseId;
      const c = courses.get(courseId)!;
      const student = c.staffRole === null;
      const status = a.submissions[0]?.status;
      out.push({
        id: `assignment-${a.id}`,
        kind: 'ASSIGNMENT',
        title: a.title,
        description: null,
        courseId,
        courseTitle: c.title,
        startsAt: a.dueAt!.toISOString(),
        endsAt: null,
        link: student
          ? `/courses/${courseId}?assignment=${a.id}`
          : `/courses/${courseId}/manage?tab=assignments`,
        done: student ? status === 'SUBMITTED' || status === 'GRADED' : null,
        role: student ? 'student' : 'staff',
        eventId: null,
        canEdit: false,
      });
    }
    for (const e of events) {
      const c = courses.get(e.courseId)!;
      out.push({
        id: `event-${e.id}`,
        kind: e.kind,
        title: e.title,
        description: e.description,
        courseId: e.courseId,
        courseTitle: c.title,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt?.toISOString() ?? null,
        link: `/courses/${e.courseId}`,
        done: null,
        role: c.staffRole === null ? 'student' : 'staff',
        eventId: e.id,
        canEdit: can(c.staffRole, 'content'),
      });
    }
    return out.sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  }

  // -------------------------------------------------------- course events

  async createEvent(
    courseId: number,
    dto: CreateCourseEventDto,
    user: AuthUser,
  ) {
    await assertCourseRole(this.prisma, courseId, user, 'content');
    const startsAt = new Date(dto.startsAt);
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    this.checkRange(startsAt, endsAt);
    const event = await this.prisma.courseEvent.create({
      data: {
        courseId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        kind: dto.kind ?? 'OTHER',
        startsAt,
        endsAt,
        createdById: user.id,
      },
    });
    await this.reminders?.scheduleEvent(event.id);
    return event;
  }

  async updateEvent(
    courseId: number,
    eventId: number,
    dto: UpdateCourseEventDto,
    user: AuthUser,
  ) {
    await assertCourseRole(this.prisma, courseId, user, 'content');
    const existing = await this.findEvent(courseId, eventId);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt =
      dto.endsAt === undefined
        ? existing.endsAt
        : dto.endsAt
          ? new Date(dto.endsAt)
          : null;
    this.checkRange(startsAt, endsAt);
    const event = await this.prisma.courseEvent.update({
      where: { id: eventId },
      data: {
        title: dto.title?.trim(),
        description:
          dto.description === undefined
            ? undefined
            : dto.description?.trim() || null,
        kind: dto.kind,
        startsAt,
        endsAt,
      },
    });
    // A moved event gets new jobs; jobs for the old date skip themselves.
    await this.reminders?.scheduleEvent(event.id);
    return event;
  }

  async deleteEvent(courseId: number, eventId: number, user: AuthUser) {
    await assertCourseRole(this.prisma, courseId, user, 'content');
    await this.findEvent(courseId, eventId);
    await this.prisma.courseEvent.delete({ where: { id: eventId } });
  }

  async listCourseEvents(courseId: number, user: AuthUser) {
    await assertCourseRole(this.prisma, courseId, user, 'view');
    return this.prisma.courseEvent.findMany({
      where: { courseId },
      orderBy: { startsAt: 'asc' },
    });
  }

  private async findEvent(courseId: number, eventId: number) {
    const event = await this.prisma.courseEvent.findUnique({
      where: { id: eventId },
    });
    if (!event || event.courseId !== courseId) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  private checkRange(startsAt: Date, endsAt: Date | null) {
    if (Number.isNaN(startsAt.getTime()))
      throw new BadRequestException('Invalid date');
    if (endsAt && endsAt < startsAt) {
      throw new BadRequestException('Event ends before it starts');
    }
  }

  // ------------------------------------------------------------ iCal feed

  private secret(): string {
    return (
      this.config.get<string>('CALENDAR_SECRET') ||
      this.config.get<string>('FILES_SIGNING_SECRET') ||
      this.config.get<string>('JWT_ACCESS_SECRET') ||
      'dev-calendar-secret'
    );
  }

  private apiBase(): string {
    const port = this.config.get<string>('PORT') ?? '5000';
    return (
      this.config.get<string>('API_PUBLIC_URL') ||
      `http://localhost:${port}/api`
    ).replace(/\/$/, '');
  }

  private appBase(): string {
    return (
      this.config.get<string>('APP_URL') || 'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  async feedUrl(userId: number) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { calendarTokenVersion: true },
    });
    const token = signCalendarToken(
      this.secret(),
      userId,
      profile?.calendarTokenVersion ?? 0,
    );
    return { url: `${this.apiBase()}/calendar/ical/${token}.ics` };
  }

  /** Revokes the old feed URL. */
  async resetFeed(userId: number) {
    await this.prisma.userProfile.upsert({
      where: { userId },
      update: { calendarTokenVersion: { increment: 1 } },
      create: { userId, calendarTokenVersion: 1 },
    });
    return this.feedUrl(userId);
  }

  /** The .ics body for a feed token, or null when the token is invalid/revoked. */
  async feed(token: string, now = new Date()): Promise<string | null> {
    const parsed = parseCalendarToken(
      this.secret(),
      token.replace(/\.ics$/, ''),
    );
    if (!parsed) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: parsed.userId },
      select: {
        id: true,
        role: true,
        blocked: true,
        profile: { select: { calendarTokenVersion: true, locale: true } },
      },
    });
    if (!user || user.blocked) return null;
    if ((user.profile?.calendarTokenVersion ?? 0) !== parsed.version)
      return null;

    const locale = user.profile?.locale;
    const courses = await this.coursesOf(user);
    const items = await this.items(
      user.id,
      courses,
      new Date(now.getTime() - 30 * DAY),
      new Date(now.getTime() + 365 * DAY),
    );
    const app = this.appBase();
    const events: IcalEvent[] = items.map((i) => {
      const label =
        i.kind === 'ASSIGNMENT'
          ? translate(locale, 'ical.deadline')
          : translate(locale, `ical.kind.${i.kind}`);
      return {
        uid: `${i.id}@lms`,
        summary: `${label}: ${i.title} (${i.courseTitle})`,
        description: i.description,
        url: `${app}${i.link}`,
        start: new Date(i.startsAt),
        end: i.endsAt ? new Date(i.endsAt) : null,
        categories: label,
      };
    });
    return buildIcal(translate(locale, 'ical.calendarName'), events, now);
  }
}
