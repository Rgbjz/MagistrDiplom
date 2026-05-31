# Plan B1 — Pricing + Purchase Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add course pricing (`Course.price`), a `Payment` table, and backend endpoints for the public course landing, the current user's enrollment status, mock purchase, and purchase history.

**Architecture:** Prisma migration adds `Course.price` + `Payment`. Course DTOs/service carry `price`. A new `StoreModule` (`StoreService` + `StoreController`) holds the public landing endpoint (no guard), `my-status`, `purchase` (mock), and `me/purchases`. Free enrollment keeps the existing `POST /courses/:id/enroll` flow.

**Tech Stack:** NestJS 11, Prisma 6, class-validator/transformer.

> **Tests out of scope.** Verification = build, boot, `curl`.

> **Env note:** Node not on default PATH — `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"`. Backend dir `/Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend`; free :5000 before boot; Postgres must run.

> **Spec:** `docs/superpowers/specs/2026-05-31-landing-pricing-purchase-design.md` (subproject B). Frontend is Plan B2.

---

## File Structure

```
backend/prisma/schema.prisma              # MODIFY: Course.price, Payment model, relations
backend/src/modules/courses/
  dto/create-course.dto.ts                # MODIFY: price
  dto/update-course.dto.ts                # MODIFY: price
  courses.service.ts                      # MODIFY: price in create/update/list
backend/src/modules/store/
  store.service.ts                        # public course, my-status, purchase, my-purchases
  store.controller.ts
  store.module.ts
backend/src/app.module.ts                 # MODIFY: register StoreModule
```

---

## Task 1: Prisma — price + Payment

**Files:** Modify `backend/prisma/schema.prisma`; migrate

- [ ] **Step 1: Add `price` to the `Course` model.** In `backend/prisma/schema.prisma`, in `model Course`, add the `price` field (after `imageUrl`) and a `payments` back-relation (in the relations block):

```prisma
  price       Int      @default(0)
```
and in the Course relations list add:
```prisma
  payments      Payment[]
```

- [ ] **Step 2: Add a `payments` back-relation to `User`.** In `model User`, add to its relations list:

```prisma
  payments         Payment[]
```

- [ ] **Step 3: Add the `Payment` model** at the end of the schema:

```prisma
model Payment {
  id        Int      @id @default(autoincrement())
  userId    Int
  courseId  Int
  amount    Int
  status    String   @default("PAID")
  createdAt DateTime @default(now())

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  course Course @relation(fields: [courseId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 4: Validate + migrate**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npx prisma validate
npx prisma migrate dev --name add-pricing-payments
```
Expected: schema valid; migration created and applied; client regenerated.

- [ ] **Step 5: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(backend): add Course.price + Payment model (migration)"
```

---

## Task 2: Course DTOs + service carry price

**Files:** Modify `backend/src/modules/courses/dto/create-course.dto.ts`, `dto/update-course.dto.ts`, `courses.service.ts`

- [ ] **Step 1: `create-course.dto.ts`** — add a coerced integer `price` (multipart fields arrive as strings, so `@Type(() => Number)`):

```typescript
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateCourseDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price?: number;
}
```

- [ ] **Step 2: `update-course.dto.ts`**

```typescript
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price?: number;
}
```

- [ ] **Step 3: `courses.service.ts`** — thread `price` through `create`, `update`, and the list `select`. Replace the `CreateCourseInput`/`UpdateCourseInput` interfaces, the `create` method, the `update` method, and add `price` to the `getCoursesForUser` select.

Replace the two interfaces near the top of the file:

```typescript
interface CreateCourseInput {
  title: string;
  description?: string;
  imageUrl?: string | null;
  price?: number;
}

interface UpdateCourseInput {
  title?: string;
  description?: string;
  imageUrl?: string | null;
  price?: number;
}
```

Replace the `create` method:

```typescript
  async create(data: CreateCourseInput, user: AuthUser) {
    if (user.role !== 'TEACHER') {
      throw new ForbiddenException('Only teachers can create courses');
    }
    return this.prisma.course.create({
      data: {
        title: data.title,
        description: data.description || '',
        imageUrl: data.imageUrl ?? null,
        price: data.price ?? 0,
        teacherId: user.id,
      },
    });
  }
```

Replace the `update` method:

```typescript
  async update(courseId: number, data: UpdateCourseInput) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    return this.prisma.course.update({
      where: { id: courseId },
      data: {
        title: data.title ?? course.title,
        description: data.description ?? course.description,
        imageUrl: data.imageUrl ?? course.imageUrl,
        price: data.price ?? course.price,
      },
    });
  }
```

In `getCoursesForUser`, add `price: true` to the `select` object (it currently selects id/title/description/imageUrl/teacherId):

```typescript
      select: {
        id: true,
        title: true,
        description: true,
        imageUrl: true,
        teacherId: true,
        price: true,
      },
```

- [ ] **Step 4: Build + commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: clean. If errors, STOP and report.

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/modules/courses
git commit -m "feat(backend): course price in dtos, service, and catalog listing"
```

---

## Task 3: StoreModule (public landing, my-status, purchase, my-purchases)

**Files:** Create `backend/src/modules/store/store.service.ts`, `store.controller.ts`, `store.module.ts`; Modify `backend/src/app.module.ts`

- [ ] **Step 1: `store.service.ts`**

```typescript
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class StoreService {
  constructor(private prisma: PrismaService) {}

  async publicCourse(id: number) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        teacher: {
          select: {
            email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        sections: {
          orderBy: { order: 'asc' },
          include: {
            lessons: {
              orderBy: { order: 'asc' },
              select: { title: true, test: { select: { id: true } } },
            },
          },
        },
      },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    const p = course.teacher.profile;
    const name =
      p && (p.firstName || p.lastName)
        ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()
        : course.teacher.email;
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      imageUrl: course.imageUrl,
      price: course.price,
      teacher: { name },
      sections: course.sections.map((s) => ({
        title: s.title,
        lessons: s.lessons.map((l) => ({
          title: l.title,
          hasTest: !!l.test,
        })),
      })),
    };
  }

  async myStatus(courseId: number, userId: number) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    return { enrollmentStatus: enrollment?.status ?? null };
  }

  async purchase(courseId: number, user: AuthUser) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.price <= 0) {
      throw new BadRequestException('Course is free');
    }
    const existing = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId } },
    });
    if (existing && existing.status === 'ACTIVE') {
      throw new BadRequestException('Already purchased');
    }
    await this.prisma.payment.create({
      data: {
        userId: user.id,
        courseId,
        amount: course.price,
        status: 'PAID',
      },
    });
    await this.prisma.enrollment.upsert({
      where: { userId_courseId: { userId: user.id, courseId } },
      create: { userId: user.id, courseId, status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    });
    return { ok: true };
  }

  async myPurchases(userId: number) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
      include: {
        course: { select: { id: true, title: true, imageUrl: true } },
      },
    });
  }
}
```

- [ ] **Step 2: `store.controller.ts`** (method-level guards; the public route has none)

```typescript
import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { StoreService } from './store.service';

@Controller()
export class StoreController {
  constructor(private store: StoreService) {}

  @Get('public/courses/:id')
  publicCourse(@Param('id', ParseIntPipe) id: number) {
    return this.store.publicCourse(id);
  }

  @Get('courses/:id/my-status')
  @UseGuards(JwtAuthGuard)
  myStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.store.myStatus(id, userId);
  }

  @Post('courses/:id/purchase')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  purchase(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.store.purchase(id, user);
  }

  @Get('me/purchases')
  @UseGuards(JwtAuthGuard)
  myPurchases(@CurrentUser('id') userId: number) {
    return this.store.myPurchases(userId);
  }
}
```

- [ ] **Step 3: `store.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { StoreService } from './store.service';
import { StoreController } from './store.controller';

@Module({
  controllers: [StoreController],
  providers: [StoreService],
})
export class StoreModule {}
```

- [ ] **Step 4: Register in `backend/src/app.module.ts`** — add `import { StoreModule } from './modules/store/store.module';` and append `StoreModule` to the `imports` array (last).

- [ ] **Step 5: Build + boot + curl verify**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null; sleep 1
( npm run start:dev > /tmp/nest-store.log 2>&1 & ) ; sleep 11
grep -E "successfully started|ERROR|Mapped \{/api/public|Mapped \{/api/me/purchases|Mapped \{/api/courses/:id/purchase" /tmp/nest-store.log | head
B=http://localhost:5000/api
TT=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"teacher@example.com","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')
S2=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"student2@example.com","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')
echo "1) teacher sets price 29 on course 1:"; curl -s -X PATCH $B/courses/1 -H "Authorization: Bearer $TT" -F "price=29" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).price'
echo "2) public landing (no auth):"; curl -s $B/public/courses/1 | node -pe 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); JSON.stringify({title:j.title,price:j.price,teacher:j.teacher.name,sections:j.sections.length})'
echo "3) student2 my-status before:"; curl -s $B/courses/1/my-status -H "Authorization: Bearer $S2" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).enrollmentStatus'
echo "4) student2 purchase:"; curl -s -X POST $B/courses/1/purchase -H "Authorization: Bearer $S2"
echo ""; echo "5) my-status after:"; curl -s $B/courses/1/my-status -H "Authorization: Bearer $S2" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).enrollmentStatus'
echo "6) repeat purchase (should 400):"; curl -s -o /dev/null -w "%{http_code}\n" -X POST $B/courses/1/purchase -H "Authorization: Bearer $S2"
echo "7) my purchases:"; curl -s $B/me/purchases -H "Authorization: Bearer $S2" | node -pe 'JSON.stringify(JSON.parse(require("fs").readFileSync(0,"utf8")).map(p=>({amount:p.amount,status:p.status,course:p.course.title})))'
echo "8) reset price to 0:"; curl -s -X PATCH $B/courses/1 -H "Authorization: Bearer $TT" -F "price=0" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).price'
lsof -ti tcp:5000 | xargs kill -9 2>/dev/null; true
```
Expected: routes mapped; (1) `29`; (2) `{title:"Intro to TypeScript",price:29,teacher:"Tessa Teacher",sections:1}`; (3) `PENDING`; (4) `{"ok":true}`; (5) `ACTIVE`; (6) `400`; (7) `[{amount:29,status:"PAID",course:"Intro to TypeScript"}]`; (8) `0`.

> Note: step 8 resets the seed course back to free so it doesn't disturb other flows. The `Payment` row and student2's ACTIVE enrollment remain (that's fine — it's real test data).

- [ ] **Step 6: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/modules/store backend/src/app.module.ts
git commit -m "feat(backend): store module (public landing, my-status, mock purchase, purchases)"
```

---

## Self-Review (author checklist — completed)

- **Spec coverage (§3–4):** `Course.price` + `Payment` (Task 1); price in DTO/service/listing (Task 2); `GET /api/public/courses/:id` (no guard), `GET /api/courses/:id/my-status` (auth), `POST /api/courses/:id/purchase` (STUDENT, mock pay → Payment + ACTIVE, free→400, dup→400), `GET /api/me/purchases` (Task 3). Free enrollment unchanged (existing `/enroll`). ✓
- **Placeholder scan:** none. **Type consistency:** `CreateCourseInput`/`UpdateCourseInput` updated with `price`; controller still calls `this.courses.create({ ...dto, imageUrl }, user)` and `update(id, data)` — `dto` now includes `price`, so it flows through. `userId_courseId` compound unique matches the schema. ✓
- **Routing:** `StoreController` paths (`public/courses/:id`, `courses/:id/my-status`, `courses/:id/purchase`, `me/purchases`) don't collide with `CoursesController` routes (distinct literals/depths). Public route has no guard; others guarded per-method. ✓
- **Deferred to B2:** public landing page, CTA, checkout, price inputs in create/builder, purchases page + profile button, price badges, middleware allow `/c/`.
