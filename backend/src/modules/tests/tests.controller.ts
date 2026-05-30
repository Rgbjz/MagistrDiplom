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
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TestsService } from './tests.service';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateTestDto } from './dto/update-test.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { UpdateAnswerDto } from './dto/update-answer.dto';
import { SubmitTestDto } from './dto/submit-test.dto';

@Controller('tests')
export class TestsController {
  constructor(private tests: TestsService) {}

  @Patch('questions/:questionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  updateQuestion(
    @Param('questionId', ParseIntPipe) questionId: number,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.tests.updateQuestion(questionId, dto);
  }

  @Delete('questions/:questionId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  deleteQuestion(@Param('questionId', ParseIntPipe) questionId: number) {
    return this.tests.deleteQuestion(questionId);
  }

  @Post('questions/:questionId/answers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  createAnswer(
    @Param('questionId', ParseIntPipe) questionId: number,
    @Body() dto: CreateAnswerDto,
  ) {
    return this.tests.createAnswer(questionId, dto);
  }

  @Patch('answers/:answerId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  updateAnswer(
    @Param('answerId', ParseIntPipe) answerId: number,
    @Body() dto: UpdateAnswerDto,
  ) {
    return this.tests.updateAnswer(answerId, dto);
  }

  @Delete('answers/:answerId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  deleteAnswer(@Param('answerId', ParseIntPipe) answerId: number) {
    return this.tests.deleteAnswer(answerId);
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

  @Get(':testId/results')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER')
  results(@Param('testId', ParseIntPipe) testId: number) {
    return this.tests.getTestResults(testId);
  }

  @Post(':id/questions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  createQuestion(
    @Param('id', ParseIntPipe) testId: number,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.tests.createQuestion(testId, dto);
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
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.tests.getById(id);
  }

  @Post(':lessonId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  createTest(
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @Body() dto: CreateTestDto,
  ) {
    return this.tests.createTest(lessonId, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTestDto) {
    return this.tests.update(id, dto);
  }
}
