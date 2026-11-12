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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import {
  SUBMISSION_MAX_FILES,
  submissionUploadOptions,
} from '../storage/upload.options';
import { AssignmentsService } from './assignments.service';
import {
  CreateAssignmentDto,
  GradeSubmissionDto,
  ReturnSubmissionDto,
  SubmitAssignmentDto,
  UpdateAssignmentDto,
} from './dto/assignment.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class AssignmentsController {
  constructor(private assignments: AssignmentsService) {}

  @Post('lessons/:lessonId/assignment')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  create(
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @Body() dto: CreateAssignmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assignments.create(lessonId, dto, user);
  }

  @Get('assignments/:id')
  getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.assignments.getOne(id, user);
  }

  @Patch('assignments/:id')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssignmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assignments.update(id, dto, user);
  }

  @Delete('assignments/:id')
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    await this.assignments.remove(id, user);
  }

  @Post('assignments/:id/submission')
  @UseGuards(RolesGuard)
  @Roles('STUDENT')
  @UseInterceptors(
    FilesInterceptor('files', SUBMISSION_MAX_FILES, submissionUploadOptions),
  )
  submit(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body() dto: SubmitAssignmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assignments.submit(id, files, dto.comment, user);
  }

  // Course team incl. assistants (checked in the service).
  @Get('assignments/:id/submissions')
  submissions(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assignments.submissions(id, user);
  }

  // Course team incl. assistants (checked in the service).
  @Patch('submissions/:id/grade')
  grade(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GradeSubmissionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assignments.grade(id, dto, user);
  }

  // Course team incl. assistants (checked in the service).
  @Patch('submissions/:id/return')
  returnForRevision(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReturnSubmissionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assignments.returnForRevision(id, dto, user);
  }

  // Course team incl. assistants (checked in the service).
  @Get('courses/:id/assignments-summary')
  summary(
    @Param('id', ParseIntPipe) courseId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.assignments.courseSummary(courseId, user);
  }
}
