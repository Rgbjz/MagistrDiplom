import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import type { NotificationFilter } from './notifications.service';

const FILTERS: NotificationFilter[] = [
  'all',
  'unread',
  'courses',
  'tests',
  'messages',
];

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser('id') userId: number, @Query('filter') filter?: string) {
    const f = FILTERS.includes(filter as NotificationFilter)
      ? (filter as NotificationFilter)
      : 'all';
    return this.notifications.list(userId, f);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser('id') userId: number) {
    return this.notifications.unreadCount(userId);
  }

  @Patch(':id/read')
  @HttpCode(204)
  markRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.notifications.markRead(id, userId);
  }

  @Post('read-all')
  @HttpCode(204)
  markAll(@CurrentUser('id') userId: number) {
    return this.notifications.markAllRead(userId);
  }
}
