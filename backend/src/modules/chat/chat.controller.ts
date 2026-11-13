import {
  Body,
  Controller,
  Delete,
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
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ChatService } from './chat.service';
import { CallService } from './call.service';
import { DirectDto } from './dto/direct.dto';
import { AddMembersDto, CreateGroupDto, RenameGroupDto } from './dto/group.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private chat: ChatService,
    private calls: CallService,
  ) {}

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

  /** Active video call in the conversation, or null. */
  @Get('conversations/:id/call')
  async activeCall(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    await this.chat.assertAccess(id, user);
    return this.calls.info(id);
  }

  @Post('conversations/direct')
  direct(@Body() dto: DirectDto, @CurrentUser() user: AuthUser) {
    return this.chat.getOrCreateDirect(user, dto.userId);
  }

  /** People for the group member picker or, with `scope=direct`, a new chat (`q` filters by name/email). */
  @Get('contacts')
  contacts(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('scope') scope?: string,
  ) {
    return this.chat.contacts(
      user,
      q ?? '',
      scope === 'direct' ? 'direct' : 'group',
    );
  }

  @Post('groups')
  createGroup(@Body() dto: CreateGroupDto, @CurrentUser() user: AuthUser) {
    return this.chat.createGroup(user, dto.title, dto.memberIds);
  }

  @Get('groups/:id')
  group(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.chat.groupDetails(id, user);
  }

  @Patch('groups/:id')
  renameGroup(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenameGroupDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chat.renameGroup(id, user, dto.title);
  }

  @Post('groups/:id/members')
  addMembers(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddMembersDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chat.addMembers(id, user, dto.userIds);
  }

  @Delete('groups/:id/members/:userId')
  removeMember(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chat.removeMember(id, user, userId);
  }

  @Post('groups/:id/leave')
  @HttpCode(200)
  leaveGroup(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chat.leaveGroup(id, user);
  }

  @Get('courses/:courseId/conversation')
  courseConversation(
    @Param('courseId', ParseIntPipe) courseId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chat.getCourseConversation(courseId, user);
  }
}
