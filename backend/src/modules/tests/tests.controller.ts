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
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { TestsService } from './tests.service';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateTestDto } from './dto/update-test.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { UpdateAnswerDto } from './dto/update-answer.dto';
import { SubmitTestDto } from './dto/submit-test.dto';
import { CopyFromBankDto, GradeEssayDto, RandomRulesDto } from './dto/bank.dto';
import { QuestionBankService } from './question-bank.service';

@Controller('tests')
export class TestsController {
  constructor(
    private tests: TestsService,
    private bank: QuestionBankService,
  ) {}

  // ----- essay review (any course staff with the 'grade' permission)

  @Get('reviews/course/:courseId')
  @UseGuards(JwtAuthGuard)
  pendingReviews(
    @Param('courseId', ParseIntPipe) courseId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tests.listPendingReviews(courseId, user);
  }

  @Patch('attempt-questions/:id/grade')
  @UseGuards(JwtAuthGuard)
  gradeEssay(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GradeEssayDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tests.gradeEssay(id, dto, user);
  }

  // ----- question bank links

  @Post(':id/copy-from-bank')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  copyFromBank(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CopyFromBankDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bank.copyToTest(id, dto.questionIds, user);
  }

  @Put(':id/random-rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  randomRules(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RandomRulesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bank.setRandomRules(id, dto.rules, user);
  }

  @Patch('questions/:questionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  updateQuestion(
    @Param('questionId', ParseIntPipe) questionId: number,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tests.updateQuestion(questionId, dto, user);
  }

  @Delete('questions/:questionId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  deleteQuestion(
    @Param('questionId', ParseIntPipe) questionId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tests.deleteQuestion(questionId, user);
  }

  @Post('questions/:questionId/answers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  createAnswer(
    @Param('questionId', ParseIntPipe) questionId: number,
    @Body() dto: CreateAnswerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tests.createAnswer(questionId, dto, user);
  }

  @Patch('answers/:answerId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  updateAnswer(
    @Param('answerId', ParseIntPipe) answerId: number,
    @Body() dto: UpdateAnswerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tests.updateAnswer(answerId, dto, user);
  }

  @Delete('answers/:answerId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  deleteAnswer(
    @Param('answerId', ParseIntPipe) answerId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tests.deleteAnswer(answerId, user);
  }

  @Get(':testId/my-result')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  myResult(
    @Param('testId', ParseIntPipe) testId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.tests.getMyTestResult(userId, testId);
  }

  @Get(':testId/my-attempts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  myAttempts(
    @Param('testId', ParseIntPipe) testId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.tests.getMyAttempts(userId, testId);
  }

  // Any course-team member (incl. assistants with a student account).
  @Get(':testId/results')
  @UseGuards(JwtAuthGuard)
  results(
    @Param('testId', ParseIntPipe) testId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tests.getTestResults(testId, user);
  }

  @Post(':id/questions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  createQuestion(
    @Param('id', ParseIntPipe) testId: number,
    @Body() dto: CreateQuestionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tests.createQuestion(testId, dto, user);
  }

  @Post(':id/start')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  start(
    @Param('id', ParseIntPipe) testId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.tests.startTest(testId, userId);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  submit(
    @Param('id', ParseIntPipe) testResultId: number,
    @Body() dto: SubmitTestDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.tests.submitTest(testResultId, userId, dto.answers);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.tests.getById(id, user);
  }

  @Post(':lessonId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  createTest(
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @Body() dto: CreateTestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tests.createTest(lessonId, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    await this.tests.deleteTest(id, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tests.update(id, dto, user);
  }
}
