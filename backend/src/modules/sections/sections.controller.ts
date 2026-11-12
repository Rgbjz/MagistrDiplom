import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { SectionsService } from './sections.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';

@Controller('sections')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEACHER')
export class SectionsController {
  constructor(private sections: SectionsService) {}

  @Post(':courseId')
  create(
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() dto: CreateSectionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sections.create(courseId, dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSectionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.sections.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.sections.remove(id, user);
  }
}
