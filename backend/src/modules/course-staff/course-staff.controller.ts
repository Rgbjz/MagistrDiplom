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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { CourseStaffService } from './course-staff.service';
import {
  AddStaffDto,
  TransferOwnershipDto,
  UpdateStaffDto,
} from './course-staff.dto';

// Access is decided by the course role (owner/teacher/assistant), not the account role.
@Controller('courses/:id/staff')
@UseGuards(JwtAuthGuard)
export class CourseStaffController {
  constructor(private staff: CourseStaffService) {}

  @Get()
  list(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.staff.list(id, user);
  }

  @Post()
  add(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddStaffDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.staff.add(id, dto.email, dto.role, user);
  }

  @Post('transfer')
  @HttpCode(200)
  transfer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransferOwnershipDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.staff.transfer(id, dto.userId, user);
  }

  @Patch(':userId')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateStaffDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.staff.update(id, userId, dto.role, user);
  }

  @Delete(':userId')
  @HttpCode(204)
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: AuthUser,
  ) {
    await this.staff.remove(id, userId, user);
  }
}
