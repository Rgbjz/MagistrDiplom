import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ChatService } from './chat.service';
import { DirectDto } from './dto/direct.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chat: ChatService) {}

  @Get('conversations')
  list(@CurrentUser('id') userId: number) {
    return this.chat.listConversations(userId);
  }

  @Get('conversations/:id/messages')
  messages(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Query('cursor') cursor?: string,
  ) {
    return this.chat.getMessages(id, user, cursor ? Number(cursor) : undefined);
  }

  @Post('conversations/direct')
  direct(@Body() dto: DirectDto, @CurrentUser('id') userId: number) {
    return this.chat.getOrCreateDirect(userId, dto.userId);
  }

  @Get('courses/:courseId/conversation')
  courseConversation(
    @Param('courseId', ParseIntPipe) courseId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chat.getCourseConversation(courseId, user);
  }
}
