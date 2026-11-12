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
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { QuestionBankService } from './question-bank.service';
import { CategoryDto, ImportGiftDto } from './dto/bank.dto';
import { CreateQuestionDto } from './dto/create-question.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEACHER', 'ADMIN')
export class QuestionBankController {
  constructor(private bank: QuestionBankService) {}

  @Get('courses/:courseId/question-bank')
  list(
    @Param('courseId', ParseIntPipe) courseId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bank.list(courseId, user);
  }

  @Post('courses/:courseId/question-bank/categories')
  createCategory(
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() dto: CategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bank.createCategory(courseId, dto.name, user);
  }

  @Post('courses/:courseId/question-bank/import')
  @HttpCode(200)
  importGift(
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() dto: ImportGiftDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bank.importGift(courseId, dto, user);
  }

  @Get('courses/:courseId/question-bank/export')
  async exportGift(
    @Param('courseId', ParseIntPipe) courseId: number,
    @Query('categoryId') categoryId: string | undefined,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const id = categoryId ? Number(categoryId) : undefined;
    const { text, filename, skipped } = await this.bank.exportGift(
      courseId,
      Number.isInteger(id) ? id : undefined,
      user,
    );
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Skipped-Questions', String(skipped));
    res.send(text);
  }

  @Patch('question-bank/categories/:id')
  renameCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bank.renameCategory(id, dto.name, user);
  }

  @Delete('question-bank/categories/:id')
  @HttpCode(204)
  async deleteCategory(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    await this.bank.deleteCategory(id, user);
  }

  @Post('question-bank/categories/:id/questions')
  createQuestion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateQuestionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.bank.createQuestion(id, dto, user);
  }
}
