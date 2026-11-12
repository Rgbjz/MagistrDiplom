import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { StorageService } from '../storage/storage.service';
import { imageUploadOptions } from '../storage/upload.options';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private users: UsersService,
    private storage: StorageService,
  ) {}

  @Get('me')
  getMe(@CurrentUser('id') userId: number) {
    return this.users.getMe(userId);
  }

  @Get('me/courses')
  getMyCourses(@CurrentUser('id') userId: number) {
    return this.users.getMyCourses(userId);
  }

  @Put('me/profile')
  @UseInterceptors(
    FileInterceptor('avatar', imageUploadOptions(2 * 1024 * 1024)),
  )
  async updateProfile(
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const data: UpdateProfileDto & { avatarUrl?: string } = { ...dto };
    if (file) {
      data.avatarUrl = await this.storage.save(file, 'avatars');
    }
    return this.users.updateProfile(userId, data);
  }

  @Post('me/password')
  @HttpCode(204)
  changePassword(
    @CurrentUser('id') userId: number,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.users.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Get('me/sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.users.listSessions(user.id, user.sid);
  }

  /** «Завершити всі інші сесії»: keeps the session of the current token. */
  @Delete('me/sessions')
  @HttpCode(204)
  deleteOtherSessions(@CurrentUser() user: AuthUser) {
    return this.users.deleteOtherSessions(user.id, user.sid);
  }

  @Delete('me/sessions/:id')
  @HttpCode(204)
  deleteSession(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.users.deleteSession(userId, id);
  }

  @Delete('me')
  @HttpCode(204)
  deleteAccount(
    @CurrentUser('id') userId: number,
    @Body() dto: DeleteAccountDto,
  ) {
    return this.users.deleteAccount(userId, dto.password);
  }
}
