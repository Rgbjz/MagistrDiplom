import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
  Param,
  ParseIntPipe,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { exportLang } from './gradebook.export';
import { GradebookService } from './gradebook.service';
import { SetOverrideDto } from './dto/override.dto';

const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
} as const;

@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GradebookController {
  constructor(private gradebook: GradebookService) {}

  // Course team incl. assistants (checked in the service).
  @Get(':id/gradebook')
  get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.gradebook.gradebook(id, user);
  }

  @Get(':id/gradebook/export')
  async export(
    @Param('id', ParseIntPipe) id: number,
    @Query('format') format: string | undefined,
    @Query('lang') lang: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    const fmt = format === 'csv' ? 'csv' : 'xlsx';
    const { buffer, filename } = await this.gradebook.export(
      id,
      user,
      fmt,
      exportLang(lang),
    );
    return new StreamableFile(buffer, {
      type: MIME[fmt],
      // ASCII fallback + RFC 5987 UTF-8 name for the Cyrillic course title.
      disposition: `attachment; filename="${filename.ascii}"; filename*=UTF-8''${encodeURIComponent(filename.unicode)}`,
      length: buffer.length,
    });
  }

  @Get(':id/my-grades')
  @Roles('STUDENT')
  myGrades(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.gradebook.myGrades(id, user);
  }

  // Manual corrections: course staff with the 'grade' permission (checked in the service).
  @Put(':id/gradebook/overrides')
  setOverride(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetOverrideDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.gradebook.setOverride(id, user, dto);
  }

  @Delete(':id/gradebook/overrides')
  clearOverride(
    @Param('id', ParseIntPipe) id: number,
    @Query('userId', ParseIntPipe) userId: number,
    @Query('itemKey') itemKey: string,
    @Query('reason') reason: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.gradebook.clearOverride(id, user, userId, itemKey, reason);
  }

  @Get(':id/gradebook/overrides/history')
  history(
    @Param('id', ParseIntPipe) id: number,
    @Query('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.gradebook.overrideHistory(id, user, userId);
  }
}
