import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCourseRole } from '../../common/access/course-access';
import { CalendarService } from './calendar.service';
import { RemindersService } from './reminders.service';
import {
  CalendarRangeDto,
  CreateCourseEventDto,
  DevRemindDto,
  UpdateCourseEventDto,
} from './dto/event.dto';

@Controller()
export class CalendarController {
  constructor(
    private calendar: CalendarService,
    private reminders: RemindersService,
    private prisma: PrismaService,
  ) {}

  @Get('calendar')
  @UseGuards(JwtAuthGuard)
  list(@Query() q: CalendarRangeDto, @CurrentUser() user: AuthUser) {
    return this.calendar.forUser(user, q.from, q.to);
  }

  @Get('calendar/ical-url')
  @UseGuards(JwtAuthGuard)
  icalUrl(@CurrentUser('id') userId: number) {
    return this.calendar.feedUrl(userId);
  }

  @Post('calendar/ical/reset')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  resetIcal(@CurrentUser('id') userId: number) {
    return this.calendar.resetFeed(userId);
  }

  /** Public (token-authenticated) feed for Google/Apple/Outlook calendar subscriptions. */
  @Get('calendar/ical/:token')
  @SkipThrottle()
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Cache-Control', 'private, max-age=300')
  @Header('Content-Disposition', 'inline; filename="lms-calendar.ics"')
  async ical(@Param('token') token: string) {
    const body = await this.calendar.feed(token);
    if (body === null) throw new NotFoundException('Calendar feed not found');
    return body;
  }

  // ---- course events (team with "content" permission)

  @Get('courses/:id/events')
  @UseGuards(JwtAuthGuard)
  courseEvents(
    @Param('id', ParseIntPipe) courseId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.calendar.listCourseEvents(courseId, user);
  }

  @Post('courses/:id/events')
  @UseGuards(JwtAuthGuard)
  createEvent(
    @Param('id', ParseIntPipe) courseId: number,
    @Body() dto: CreateCourseEventDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.calendar.createEvent(courseId, dto, user);
  }

  @Patch('courses/:id/events/:eventId')
  @UseGuards(JwtAuthGuard)
  updateEvent(
    @Param('id', ParseIntPipe) courseId: number,
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() dto: UpdateCourseEventDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.calendar.updateEvent(courseId, eventId, dto, user);
  }

  @Delete('courses/:id/events/:eventId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async deleteEvent(
    @Param('id', ParseIntPipe) courseId: number,
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: AuthUser,
  ) {
    await this.calendar.deleteEvent(courseId, eventId, user);
  }

  /**
   * Development/e2e only: send the reminder for an assignment/event now
   * instead of waiting 24 h / 1 h. Disabled when NODE_ENV=production.
   */
  @Post('calendar/dev/remind')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async devRemind(@Body() dto: DevRemindDto, @CurrentUser() user: AuthUser) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    const id = Number(dto.id);
    if (!Number.isInteger(id) || id <= 0) throw new NotFoundException();
    const courseId =
      dto.kind === 'assignment'
        ? (
            await this.prisma.assignment.findUnique({
              where: { id },
              select: {
                lesson: { select: { section: { select: { courseId: true } } } },
              },
            })
          )?.lesson.section.courseId
        : (
            await this.prisma.courseEvent.findUnique({
              where: { id },
              select: { courseId: true },
            })
          )?.courseId;
    if (!courseId) throw new NotFoundException();
    await assertCourseRole(this.prisma, courseId, user, 'content').catch(() => {
      throw new ForbiddenException();
    });
    return { notified: await this.reminders.remindNow(dto.kind, id) };
  }
}
