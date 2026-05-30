# Plan 2c — Tests Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Tests backend domain — test/question/answer CRUD, the test-taking flow (start → submit with scoring), and results — REST contract identical to the legacy Express app. This completes the backend.

**Architecture:** One NestJS `TestsModule` (`TestsService` + `TestsController`) mounted at `/api/tests`. Builds on the Plan 2a foundation (PrismaService, JwtAuthGuard, RolesGuard, @Roles, @CurrentUser). Scoring is exact-set-match of correct answer ids per question; the submit endpoint enforces the test's time limit.

**Tech Stack:** Node v24 (nvm), NestJS 11, Prisma 6. JSON bodies (no multipart here).

> **Tests out of scope** (per design spec). Verification uses build, server boot, `curl`, `psql`.

> **Env note:** Node not on default PATH — prepend `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"`. Postgres must be running. **Before starting the server, free port 5000:** `lsof -ti tcp:5000 | xargs kill -9 2>/dev/null`. DB seeded: course 1 has one lesson with a test "Lesson 1 Quiz" (1 question, 3 answers, correct = "JavaScript"); student1 is ACTIVE on course 1.

> **tsconfig gotcha (carried forward):** `isolatedModules` + `nodenext` + `emitDecoratorMetadata`. Types used only as decorated handler-parameter types use `import type` (e.g. `AuthUser`). DTO classes use normal import.

> **Route note:** `POST /api/tests/:id/submit` — the `:id` path param is the **TestResult id** (returned by `start`), NOT a test id. Preserve this exactly.

---

## File Structure (created by this plan)

```
backend/src/modules/tests/
  dto/create-test.dto.ts
  dto/update-test.dto.ts
  dto/create-question.dto.ts
  dto/update-question.dto.ts
  dto/create-answer.dto.ts
  dto/update-answer.dto.ts
  dto/submit-test.dto.ts
  tests.service.ts
  tests.controller.ts
  tests.module.ts
backend/src/app.module.ts   # MODIFY: register TestsModule
```

---

## Task 1: DTOs + TestsService

**Files:** Create the 7 DTO files and `backend/src/modules/tests/tests.service.ts`

- [ ] **Step 1: `dto/create-test.dto.ts`**

```typescript
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateTestDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsInt()
  timeLimit?: number;

  @IsOptional()
  @IsInt()
  passingScore?: number;
}
```

- [ ] **Step 2: `dto/update-test.dto.ts`**

```typescript
import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateTestDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsInt()
  timeLimit?: number;

  @IsOptional()
  @IsInt()
  passingScore?: number;
}
```

- [ ] **Step 3: `dto/create-question.dto.ts`**

```typescript
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsIn(['SINGLE', 'MULTIPLE'])
  type?: 'SINGLE' | 'MULTIPLE';

  @IsOptional()
  @IsInt()
  difficulty?: number;
}
```

- [ ] **Step 4: `dto/update-question.dto.ts`**

```typescript
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateQuestionDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsIn(['SINGLE', 'MULTIPLE'])
  type?: 'SINGLE' | 'MULTIPLE';

  @IsOptional()
  @IsInt()
  difficulty?: number;
}
```

- [ ] **Step 5: `dto/create-answer.dto.ts`**

```typescript
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateAnswerDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;
}
```

- [ ] **Step 6: `dto/update-answer.dto.ts`**

```typescript
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateAnswerDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;
}
```

- [ ] **Step 7: `dto/submit-test.dto.ts`**

```typescript
import { IsObject } from 'class-validator';

export class SubmitTestDto {
  // Map of questionId -> array of chosen answer ids, e.g. { "5": [12, 14] }
  @IsObject()
  answers: Record<string, number[]>;
}
```

- [ ] **Step 8: `tests.service.ts`**

```typescript
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface CreateTestInput {
  title?: string;
  timeLimit?: number;
  passingScore?: number;
}

@Injectable()
export class TestsService {
  constructor(private prisma: PrismaService) {}

  async getById(id: number) {
    const test = await this.prisma.test.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { id: 'asc' },
          include: { answers: { orderBy: { id: 'asc' } } },
        },
      },
    });
    if (!test) {
      throw new NotFoundException('Test not found');
    }
    return test;
  }

  async createTest(lessonId: number, data: CreateTestInput = {}) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { test: true },
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
    if (lesson.test) {
      throw new BadRequestException('Test already exists for this lesson');
    }
    return this.prisma.test.create({
      data: {
        lessonId,
        title: data.title ?? 'Test',
        timeLimit: data.timeLimit ?? 10,
        passingScore: data.passingScore ?? 60,
      },
    });
  }

  async update(id: number, data: CreateTestInput) {
    const test = await this.prisma.test.findUnique({ where: { id } });
    if (!test) {
      throw new NotFoundException('Test not found');
    }
    return this.prisma.test.update({ where: { id }, data });
  }

  // ===== QUESTIONS =====

  async createQuestion(
    testId: number,
    data: { text: string; type?: 'SINGLE' | 'MULTIPLE'; difficulty?: number },
  ) {
    return this.prisma.question.create({
      data: {
        testId,
        text: data.text,
        type: data.type ?? 'SINGLE',
        difficulty: data.difficulty ?? 1,
      },
    });
  }

  async updateQuestion(
    id: number,
    data: { text?: string; type?: 'SINGLE' | 'MULTIPLE'; difficulty?: number },
  ) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    return this.prisma.question.update({ where: { id }, data });
  }

  async deleteQuestion(id: number) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    await this.prisma.question.delete({ where: { id } });
  }

  // ===== ANSWERS =====

  async createAnswer(questionId: number, data: { text: string; isCorrect?: boolean }) {
    return this.prisma.answer.create({
      data: { questionId, text: data.text, isCorrect: !!data.isCorrect },
    });
  }

  async updateAnswer(id: number, data: { text?: string; isCorrect?: boolean }) {
    const answer = await this.prisma.answer.findUnique({ where: { id } });
    if (!answer) {
      throw new NotFoundException('Answer not found');
    }
    return this.prisma.answer.update({ where: { id }, data });
  }

  async deleteAnswer(id: number) {
    const answer = await this.prisma.answer.findUnique({ where: { id } });
    if (!answer) {
      throw new NotFoundException('Answer not found');
    }
    await this.prisma.answer.delete({ where: { id } });
  }

  // ===== RESULTS =====

  async getTestResults(testId: number) {
    const test = await this.prisma.test.findUnique({ where: { id: testId } });
    if (!test) {
      throw new NotFoundException('Test not found');
    }
    const results = await this.prisma.testResult.findMany({
      where: { testId, finishedAt: { not: null } },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: [{ userId: 'asc' }, { attempt: 'desc' }],
    });

    const lastResults = new Map<number, (typeof results)[number]>();
    for (const r of results) {
      if (!lastResults.has(r.userId)) {
        lastResults.set(r.userId, r);
      }
    }

    return Array.from(lastResults.values()).map((r) => ({
      userId: r.user.id,
      userName: r.user.profile
        ? `${r.user.profile.firstName ?? ''} ${r.user.profile.lastName ?? ''}`.trim()
        : 'Без имени',
      email: r.user.email,
      attempt: r.attempt,
      score: r.score,
      passed: r.passed,
      finishedAt: r.finishedAt,
    }));
  }

  async getMyTestResult(userId: number, testId: number) {
    const result = await this.prisma.testResult.findFirst({
      where: { userId, testId, finishedAt: { not: null } },
      orderBy: { attempt: 'desc' },
      include: { answers: true },
    });
    if (!result) {
      return null;
    }

    const questions = await this.prisma.question.findMany({
      where: { testId },
      include: { answers: true },
    });

    const details = questions.map((q) => {
      const correctAnswerIds = q.answers
        .filter((a) => a.isCorrect)
        .map((a) => a.id);
      const userAnswerIds = result.answers
        .filter((a) => a.questionId === q.id)
        .map((a) => a.answerId);
      return { questionId: q.id, correctAnswerIds, userAnswerIds };
    });

    return {
      id: result.id,
      score: result.score,
      passed: result.passed,
      finishedAt: result.finishedAt,
      details,
    };
  }

  // ===== TAKING A TEST =====

  async startTest(testId: number, userId: number) {
    const test = await this.prisma.test.findUnique({
      where: { id: testId },
      include: {
        questions: {
          orderBy: { id: 'asc' },
          include: {
            answers: { orderBy: { id: 'asc' }, select: { id: true, text: true } },
          },
        },
      },
    });
    if (!test) {
      throw new NotFoundException('Test not found');
    }

    const attempts = await this.prisma.testResult.count({
      where: { testId, userId },
    });

    const testResult = await this.prisma.testResult.create({
      data: { testId, userId, attempt: attempts + 1, startedAt: new Date() },
    });

    return {
      testResultId: testResult.id,
      attempt: testResult.attempt,
      timeLimit: test.timeLimit,
      startedAt: testResult.startedAt,
      questions: test.questions,
    };
  }

  async submitTest(
    testResultId: number,
    userId: number,
    answers: Record<string, number[]>,
  ) {
    const testResult = await this.prisma.testResult.findUnique({
      where: { id: testResultId },
      include: {
        test: { include: { questions: { include: { answers: true } } } },
      },
    });

    if (!testResult) {
      throw new NotFoundException('Test result not found');
    }
    if (testResult.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    if (testResult.finishedAt) {
      throw new BadRequestException('Test already submitted');
    }

    const deadline = new Date(testResult.startedAt);
    deadline.setMinutes(deadline.getMinutes() + testResult.test.timeLimit);
    const finishedAt = new Date();
    if (finishedAt > deadline) {
      finishedAt.setTime(deadline.getTime());
    }

    let correct = 0;
    for (const question of testResult.test.questions) {
      const correctIds = question.answers
        .filter((a) => a.isCorrect)
        .map((a) => a.id)
        .sort((x, y) => x - y);
      const userIds = (answers[question.id] ?? [])
        .slice()
        .sort((x, y) => x - y);

      const isCorrect =
        correctIds.length === userIds.length &&
        correctIds.every((id, i) => id === userIds[i]);

      for (const answerId of userIds) {
        await this.prisma.userAnswer.create({
          data: { userId, questionId: question.id, answerId, testResultId },
        });
      }

      if (isCorrect) {
        correct++;
      }
    }

    const total = testResult.test.questions.length;
    const score = Math.round((correct / total) * 100);
    const passed = score >= testResult.test.passingScore;

    await this.prisma.testResult.update({
      where: { id: testResultId },
      data: { finishedAt, score, passed },
    });

    return { score, passed, correct, total, finishedAt };
  }
}
```

- [ ] **Step 9: Build + commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: clean (module not yet registered, but tsc validates all src). If errors, STOP and report.

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/modules/tests/dto backend/src/modules/tests/tests.service.ts
git commit -m "feat(backend): add tests service + dtos"
```

---

## Task 2: TestsController + module + registration

**Files:** Create `backend/src/modules/tests/tests.controller.ts`, `tests.module.ts`; Modify `backend/src/app.module.ts`

- [ ] **Step 1: `tests.controller.ts`**

```typescript
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

  // ===== Question/Answer management (literal-prefixed routes first) =====

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

  // ===== Test taking / results (two-segment, literal 2nd segment) =====

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

  // ===== Single-segment routes last =====

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
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTestDto,
  ) {
    return this.tests.update(id, dto);
  }
}
```

- [ ] **Step 2: `tests.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TestsService } from './tests.service';
import { TestsController } from './tests.controller';

@Module({
  controllers: [TestsController],
  providers: [TestsService],
})
export class TestsModule {}
```

- [ ] **Step 3: Register in `backend/src/app.module.ts`** — add the import and list entry. The full file becomes:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CoursesModule } from './modules/courses/courses.module';
import { SectionsModule } from './modules/sections/sections.module';
import { LessonsModule } from './modules/lessons/lessons.module';
import { ProgressModule } from './modules/progress/progress.module';
import { TestsModule } from './modules/tests/tests.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CoursesModule,
    SectionsModule,
    LessonsModule,
    ProgressModule,
    TestsModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 4: Build**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: clean. If errors, STOP and report exact error.

- [ ] **Step 5: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/modules/tests/tests.controller.ts backend/src/modules/tests/tests.module.ts backend/src/app.module.ts
git commit -m "feat(backend): add tests controller + register module"
```

---

## Task 3: End-to-end verification via curl

**Files:** none (runtime). Postgres running; DB seeded.

- [ ] **Step 1: Free port 5000 and start the backend**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null; sleep 1
( npm run start:dev > /tmp/nest-2c.log 2>&1 & ) ; sleep 11
grep -E "successfully started|EADDRINUSE|ERROR" /tmp/nest-2c.log | head -3
```
Expected: started, no EADDRINUSE/ERROR.

- [ ] **Step 2: Tokens + seeded ids**

```bash
B=http://localhost:5000/api
PG=/Applications/Postgres.app/Contents/Versions/latest/bin/psql
TT=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"teacher@example.com","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')
S1=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"student1@example.com","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')
TID=$("$PG" -h localhost -p 5432 -U macbookpro -d magistrdiplom -tAc 'select id from "Test" order by id asc limit 1;')
QID=$("$PG" -h localhost -p 5432 -U macbookpro -d magistrdiplom -tAc "select id from \"Question\" where \"testId\"=$TID order by id asc limit 1;")
CORRECT=$("$PG" -h localhost -p 5432 -U macbookpro -d magistrdiplom -tAc "select id from \"Answer\" where \"questionId\"=$QID and \"isCorrect\"=true limit 1;")
LID=$("$PG" -h localhost -p 5432 -U macbookpro -d magistrdiplom -tAc 'select id from "Lesson" order by id asc limit 1;')
echo "testId=$TID questionId=$QID correctAnswerId=$CORRECT lessonId=$LID"
```

- [ ] **Step 3: Teacher reads the test (sees answers with isCorrect)**

```bash
curl -s $B/tests/$TID -H "Authorization: Bearer $TT" | node -pe 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); JSON.stringify({title:j.title, questions:j.questions.length, firstQAnswers:j.questions[0].answers.map(a=>({id:a.id,isCorrect:a.isCorrect}))})'
```
Expected: `title:"Lesson 1 Quiz"`, 1 question, answers include `isCorrect` flags (one true).

- [ ] **Step 4: Student starts the test (answers WITHOUT isCorrect)**

```bash
START=$(curl -s -X POST $B/tests/$TID/start -H "Authorization: Bearer $S1")
echo "$START" | node -pe 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); JSON.stringify({testResultId:j.testResultId, attempt:j.attempt, timeLimit:j.timeLimit, answerKeysLeaked: Object.keys(j.questions[0].answers[0])})'
TR=$(echo "$START" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).testResultId')
echo "testResultId=$TR"
```
Expected: prints a `testResultId`, `attempt:1`, `timeLimit:10`, and `answerKeysLeaked:["id","text"]` (NO `isCorrect`).

- [ ] **Step 5: Student submits the correct answer → score 100, passed**

```bash
curl -s -X POST $B/tests/$TR/submit -H "Authorization: Bearer $S1" -H 'Content-Type: application/json' -d "{\"answers\":{\"$QID\":[$CORRECT]}}"
```
Expected: `{"score":100,"passed":true,"correct":1,"total":1,"finishedAt":"..."}`.

- [ ] **Step 6: Re-submitting the same result is rejected**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/tests/$TR/submit -H "Authorization: Bearer $S1" -H 'Content-Type: application/json' -d "{\"answers\":{\"$QID\":[$CORRECT]}}"
```
Expected: `400` (already submitted).

- [ ] **Step 7: Student fetches own result detail**

```bash
curl -s $B/tests/$TID/my-result -H "Authorization: Bearer $S1" | node -pe 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); JSON.stringify({score:j.score, passed:j.passed, details:j.details})'
```
Expected: `score:100, passed:true`, and `details` with `correctAnswerIds` == `userAnswerIds` for the question.

- [ ] **Step 8: Teacher fetches results list**

```bash
curl -s $B/tests/$TID/results -H "Authorization: Bearer $TT" | node -pe 'JSON.stringify(JSON.parse(require("fs").readFileSync(0,"utf8")))'
```
Expected: array containing `{ userId, userName:"Sam Student", email:"student1@example.com", attempt:1, score:100, passed:true, finishedAt }`.

- [ ] **Step 9: Course progress now reflects the passed test**

```bash
curl -s $B/courseProgress/courses/1/progress -H "Authorization: Bearer $S1"
```
Expected: `tests` array now includes the test id; `completed` counts the passed test (percent rises toward 100 if the lesson was also completed earlier).

- [ ] **Step 10: Test CRUD — teacher adds a question + answer**

```bash
NQ=$(curl -s -X POST $B/tests/$TID/questions -H "Authorization: Bearer $TT" -H 'Content-Type: application/json' -d '{"text":"2+2=?","type":"SINGLE","difficulty":1}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).id')
curl -s -X POST $B/tests/questions/$NQ/answers -H "Authorization: Bearer $TT" -H 'Content-Type: application/json' -d '{"text":"4","isCorrect":true}' | node -pe 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); JSON.stringify({id:j.id,text:j.text,isCorrect:j.isCorrect})'
```
Expected: a new question id is created, then an answer `{text:"4",isCorrect:true}`.

- [ ] **Step 11: Role enforcement — student cannot create a test (403); cannot read results (403)**

```bash
echo -n "student create test => "; curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/tests/$LID -H "Authorization: Bearer $S1" -H 'Content-Type: application/json' -d '{"title":"Nope"}'
echo -n "student read results => "; curl -s -o /dev/null -w "%{http_code}\n" $B/tests/$TID/results -H "Authorization: Bearer $S1"
```
Expected: both `403`.

- [ ] **Step 12: Stop the server**

```bash
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null; true
```

No commit (verification only).

---

## Self-Review (author checklist — completed)

- **Contract coverage:** GET `/:id`, POST `/:lessonId`, PATCH `/:id`, POST `/:id/questions`, PATCH `/questions/:questionId`, DELETE `/questions/:questionId`, POST `/questions/:questionId/answers`, PATCH `/answers/:answerId`, DELETE `/answers/:answerId`, GET `/:testId/my-result`, GET `/:testId/results`, POST `/:id/start`, POST `/:id/submit` — all present (Task 2). Logic ported 1:1 from legacy `testService` (set-match scoring, time-limit cap on `finishedAt`, attempt counting, last-attempt-per-user results, `startTest` hides `isCorrect`). ✓
- **Routing:** literal-prefixed routes (`questions/...`, `answers/...`) and two-segment literal routes (`:id/start`, `:id/submit`, `:id/questions`, `:testId/results`, `:testId/my-result`) are declared BEFORE the single-segment `:id` / `:lessonId` routes to avoid param shadowing. `:id` on submit is the TestResult id. ✓
- **Status codes:** create test/question/answer 201 (default POST); update 200; delete question/answer 204; start/submit 200; getById/results/my-result 200. ✓
- **Role gates:** GET `/:id` auth-only; create/update/delete test/question/answer TEACHER+ADMIN; results TEACHER; my-result/start/submit STUDENT. ✓
- **Types:** Question `type` typed as `'SINGLE' | 'MULTIPLE'` so it satisfies Prisma's `QuestionType`; `import type` not needed in the controller (no express/AuthUser param types used). Scoring uses numeric sort (equivalent to legacy's, order-independent set comparison). ✓
- **Placeholder scan:** none. **This completes the backend** — all legacy `/api/...` routes are reimplemented (auth, users, courses, sections, lessons, progress, tests). Next: Plan 3 (Next.js frontend + Auth.js).
