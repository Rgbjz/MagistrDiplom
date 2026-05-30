# Plan 2a — Backend Foundation + Auth + Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the NestJS backend foundation (Prisma access, config, global exception filter, JWT + role auth) and implement the Auth and Users modules with a REST contract identical to the legacy Express app.

**Architecture:** NestJS 11 modular structure. A global `PrismaModule` exposes `PrismaService`. Shared auth primitives (Passport JWT strategy, `JwtAuthGuard`, `RolesGuard`, `@Roles`, `@CurrentUser`) live under `src/common`. A global exception filter reproduces the legacy `{ message, errors }` error shape. Access token via `Authorization: Bearer`, refresh token via httpOnly `refreshToken` cookie with SHA-256 hash stored in the `Session` table (full rotation on refresh).

**Tech Stack:** Node v24 (nvm), NestJS 11, Prisma 6 (client already generated), Passport JWT, bcrypt, class-validator, multer (avatar upload).

> **Tests out of scope** (per design spec). Verification uses build, server boot, `curl`, and `psql` checks.

> **Env note:** Node is not on default PATH. Prepend to every node/npm/npx command:
> `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"`
> The PostgreSQL server must be running (see memory `magistrdiplom-local-postgres`). The DB is already migrated + seeded (teacher@example.com / student1@example.com / student2@example.com, all password `password123`).

> **Env vars used** (already in `backend/.env`): `DATABASE_URL`, `PORT=5000`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN=15m`, `JWT_REFRESH_EXPIRES_IN=30d`. This plan also references optional `FRONTEND_URL` (defaults to `http://localhost:3000`).

---

## File Structure (created by this plan)

```
backend/src/
  main.ts                                  # MODIFY: bootstrap (prefix, cors, cookies, pipe, filter, static)
  app.module.ts                            # MODIFY: wire modules
  (delete app.controller.ts, app.controller.spec.ts, app.service.ts)
  prisma/
    prisma.service.ts
    prisma.module.ts
  common/
    filters/all-exceptions.filter.ts
    decorators/current-user.decorator.ts
    auth/jwt.strategy.ts
    auth/jwt-auth.guard.ts
    auth/roles.decorator.ts
    auth/roles.guard.ts
    utils/duration.ts
  modules/
    auth/
      dto/register.dto.ts
      dto/login.dto.ts
      auth.service.ts
      auth.controller.ts
      auth.module.ts
    users/
      dto/update-profile.dto.ts
      users.service.ts
      users.controller.ts
      users.module.ts
backend/public/avatars/.gitkeep            # upload destination
backend/public/courses/.gitkeep            # (used in Plan 2b)
```

---

## Task 1: Install dependencies

**Files:** `backend/package.json` (deps)

- [ ] **Step 1: Install runtime + dev deps**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm install @nestjs/config @nestjs/jwt @nestjs/passport passport passport-jwt cookie-parser class-validator class-transformer
npm install -D @types/passport-jwt @types/cookie-parser @types/multer
```

- [ ] **Step 2: Verify install**

Run: `cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend && node -e "['@nestjs/config','@nestjs/jwt','@nestjs/passport','passport-jwt','cookie-parser','class-validator'].forEach(p=>require.resolve(p))" && echo OK`
Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/package.json backend/package-lock.json
git commit -m "chore(backend): add auth/config/validation deps"
```

---

## Task 2: PrismaModule + PrismaService

**Files:** Create `backend/src/prisma/prisma.service.ts`, `backend/src/prisma/prisma.module.ts`

- [ ] **Step 1: Create `prisma.service.ts`**

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- [ ] **Step 2: Create `prisma.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/prisma
git commit -m "feat(backend): add global PrismaModule"
```

---

## Task 3: Common utilities — duration parser

**Files:** Create `backend/src/common/utils/duration.ts`

- [ ] **Step 1: Create `duration.ts`** (parses `"30d"`, `"15m"` to milliseconds; avoids the `ms` package's type friction)

```typescript
const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Convert a duration string like "15m", "30d", "1h" to milliseconds. */
export function durationToMs(value: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(value.trim());
  if (!match) {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : 0;
  }
  return Number(match[1]) * UNIT_MS[match[2]];
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/common/utils/duration.ts
git commit -m "feat(backend): add duration parser util"
```

---

## Task 4: Global exception filter

**Files:** Create `backend/src/common/filters/all-exceptions.filter.ts`

Reproduces the legacy error envelope `{ message, errors }`. class-validator failures (array `message`) become `{ message: "Validation error", errors: string[] }`.

- [ ] **Step 1: Create the filter**

```typescript
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Unexpected server error';
    let errors: unknown = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        if (Array.isArray(b.message)) {
          message = 'Validation error';
          errors = b.message;
        } else {
          message = (b.message as string) ?? exception.message;
          errors = (b.errors as unknown) ?? null;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    res.status(status).json({ message, errors });
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/common/filters
git commit -m "feat(backend): add global exception filter (message/errors envelope)"
```

---

## Task 5: Auth primitives (decorator, JWT strategy, guards, roles)

**Files:** Create `backend/src/common/decorators/current-user.decorator.ts`, `backend/src/common/auth/jwt.strategy.ts`, `backend/src/common/auth/jwt-auth.guard.ts`, `backend/src/common/auth/roles.decorator.ts`, `backend/src/common/auth/roles.guard.ts`

- [ ] **Step 1: `current-user.decorator.ts`**

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN';

export interface AuthUser {
  id: number;
  role: UserRole;
  email?: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthUser;
    return data ? user?.[data] : user;
  },
);
```

- [ ] **Step 2: `jwt.strategy.ts`**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser, UserRole } from '../decorators/current-user.decorator';

interface JwtPayload {
  id: number;
  role: UserRole;
  email?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET') as string,
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (!payload?.id) {
      throw new UnauthorizedException('Invalid token');
    }
    return { id: payload.id, role: payload.role, email: payload.email };
  }
}
```

- [ ] **Step 3: `jwt-auth.guard.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- [ ] **Step 4: `roles.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../decorators/current-user.decorator';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
```

- [ ] **Step 5: `roles.guard.ts`** (use AFTER `JwtAuthGuard`, e.g. `@UseGuards(JwtAuthGuard, RolesGuard)`)

```typescript
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { AuthUser, UserRole } from '../decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) {
      return true;
    }
    const user = context.switchToHttp().getRequest().user as AuthUser;
    if (!user) {
      throw new UnauthorizedException('Unauthorized');
    }
    if (!roles.includes(user.role)) {
      throw new ForbiddenException('Forbidden');
    }
    return true;
  }
}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/common
git commit -m "feat(backend): add JWT strategy, guards, roles, current-user decorator"
```

---

## Task 6: Auth module (DTOs, service, controller, module)

**Files:** Create `backend/src/modules/auth/dto/register.dto.ts`, `dto/login.dto.ts`, `auth.service.ts`, `auth.controller.ts`, `auth.module.ts`

- [ ] **Step 1: `dto/register.dto.ts`**

```typescript
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsIn(['TEACHER', 'STUDENT'])
  role?: 'TEACHER' | 'STUDENT';
}
```

- [ ] **Step 2: `dto/login.dto.ts`**

```typescript
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
```

- [ ] **Step 3: `auth.service.ts`**

```typescript
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { durationToMs } from '../../common/utils/duration';
import { UserRole } from '../../common/decorators/current-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

interface JwtPayload {
  id: number;
  role: UserRole;
  email?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private signAccess(payload: JwtPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });
  }

  private signRefresh(payload: JwtPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d',
    });
  }

  private refreshTtlMs(): number {
    return durationToMs(
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d',
    );
  }

  private async createAuthResponse(user: {
    id: number;
    email: string;
    role: UserRole;
  }) {
    const payload: JwtPayload = {
      id: user.id,
      role: user.role,
      email: user.email,
    };
    const accessToken = this.signAccess(payload);
    const refreshToken = this.signRefresh(payload);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlMs()),
      },
    });

    return {
      user: { id: user.id, email: user.email, role: user.role },
      accessToken,
      refreshToken,
    };
  }

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) {
      throw new BadRequestException('User already exists');
    }
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: await bcrypt.hash(dto.password, 10),
        role: dto.role === 'TEACHER' ? 'TEACHER' : 'STUDENT',
        profile: { create: {} },
      },
    });
    return this.createAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.createAuthResponse(user);
  }

  async refresh(refreshToken?: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token');
    }
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.session.findFirst({
      where: {
        userId: payload.id,
        refreshTokenHash: this.hashToken(refreshToken),
      },
    });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    const clean: JwtPayload = {
      id: payload.id,
      role: payload.role,
      email: payload.email,
    };
    const accessToken = this.signAccess(clean);
    const newRefreshToken = this.signRefresh(clean);

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: this.hashToken(newRefreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlMs()),
      },
    });

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      return;
    }
    await this.prisma.session.deleteMany({
      where: { refreshTokenHash: this.hashToken(refreshToken) },
    });
  }
}
```

- [ ] **Step 4: `auth.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';

const REFRESH_COOKIE = 'refreshToken';
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: false,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  // POST defaults to 201 in Nest — matches legacy register status.
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...data } = await this.auth.register(dto);
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS);
    return data;
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...data } = await this.auth.login(dto);
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS);
    return data;
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const { accessToken, refreshToken } = await this.auth.refresh(token);
    res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS);
    return { accessToken };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await this.auth.logout(token);
    res.clearCookie(REFRESH_COOKIE);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return { id: user.id, email: user.email, role: user.role };
  }
}
```

- [ ] **Step 5: `auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from '../../common/auth/jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/modules/auth
git commit -m "feat(backend): add auth module (register/login/refresh/logout/me)"
```

---

## Task 7: Users module + upload directories

**Files:** Create `backend/src/modules/users/dto/update-profile.dto.ts`, `users.service.ts`, `users.controller.ts`, `users.module.ts`, `backend/public/avatars/.gitkeep`, `backend/public/courses/.gitkeep`; Modify root `.gitignore`

- [ ] **Step 1: Create upload directories with keepers**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
mkdir -p public/avatars public/courses
touch public/avatars/.gitkeep public/courses/.gitkeep
```

- [ ] **Step 2: Ignore uploaded files but keep the folders.** Append to the ROOT `.gitignore` (`/Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/.gitignore`):

```
# Backend uploaded files (keep dirs via .gitkeep)
backend/public/avatars/*
backend/public/courses/*
!backend/public/avatars/.gitkeep
!backend/public/courses/.gitkeep
```

- [ ] **Step 3: `dto/update-profile.dto.ts`**

```typescript
import { IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  bio?: string;
}
```

- [ ] **Step 4: `users.service.ts`**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface ProfileUpdate {
  firstName?: string;
  lastName?: string;
  bio?: string;
  avatarUrl?: string;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, profile: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateProfile(userId: number, data: ProfileUpdate) {
    const existing = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!existing) {
      return this.prisma.userProfile.create({ data: { userId, ...data } });
    }
    return this.prisma.userProfile.update({ where: { userId }, data });
  }

  async getMyCourses(userId: number) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          include: { teacher: { select: { id: true, email: true } } },
        },
      },
    });
    return enrollments.map((enrollment) => enrollment.course);
  }
}
```

- [ ] **Step 5: `users.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Get,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

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
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: './public/avatars',
        filename: (_req, file, cb) =>
          cb(null, `avatars-${Date.now()}${extname(file.originalname)}`),
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) =>
        cb(null, file.mimetype.startsWith('image/')),
    }),
  )
  updateProfile(
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const data: UpdateProfileDto & { avatarUrl?: string } = { ...dto };
    if (file) {
      data.avatarUrl = `/public/avatars/${file.filename}`;
    }
    return this.users.updateProfile(userId, data);
  }
}
```

- [ ] **Step 6: `users.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 7: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/modules/users backend/public .gitignore
git commit -m "feat(backend): add users module (me, profile upload, my courses)"
```

---

## Task 8: Bootstrap wiring (main.ts + app.module.ts), remove scaffold controller

**Files:** Modify `backend/src/main.ts`, `backend/src/app.module.ts`; Delete `backend/src/app.controller.ts`, `backend/src/app.controller.spec.ts`, `backend/src/app.service.ts`

- [ ] **Step 1: Replace `backend/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 2: Delete the scaffold controller/service**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
rm -f src/app.controller.ts src/app.controller.spec.ts src/app.service.ts
```

- [ ] **Step 3: Replace `backend/src/main.ts`**

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as cookieParser from 'cookie-parser';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useStaticAssets(join(__dirname, '..', 'public'), { prefix: '/public/' });

  const port = process.env.PORT ?? 5000;
  await app.listen(port);
  console.log(`🚀 Backend on http://localhost:${port}`);
}
void bootstrap();
```

- [ ] **Step 4: Verify the build compiles**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
npm run build
```
Expected: `nest build` completes with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom
git add backend/src/main.ts backend/src/app.module.ts
git rm --cached backend/src/app.controller.ts backend/src/app.controller.spec.ts backend/src/app.service.ts 2>/dev/null || true
git add -A backend/src
git commit -m "feat(backend): bootstrap (prefix/cors/cookies/pipe/filter/static) and wire modules"
```

---

## Task 9: End-to-end verification via curl

**Files:** none (runtime verification). Requires the Postgres server running and the DB seeded.

- [ ] **Step 1: Start the backend in the background**

```bash
cd /Users/macbookpro/Desktop/MagistrDiplom/MagistrDiplom/backend
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
# ensure Postgres is up:
/Applications/Postgres.app/Contents/Versions/latest/bin/pg_isready -h localhost -p 5432
npm run start:dev > /tmp/nest-backend.log 2>&1 &
sleep 8
tail -5 /tmp/nest-backend.log
```
Expected: log shows `🚀 Backend on http://localhost:5000` and Nest route mappings (no crash).

- [ ] **Step 2: Login as the seeded teacher, capture access token + refresh cookie**

```bash
curl -s -i -c /tmp/cj.txt -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"teacher@example.com","password":"password123"}'
```
Expected: `HTTP/1.1 200`, JSON body `{"user":{"id":...,"email":"teacher@example.com","role":"TEACHER"},"accessToken":"..."}`, and a `Set-Cookie: refreshToken=...; HttpOnly` header. Save the `accessToken` value for the next steps:
```bash
TOKEN=$(curl -s -c /tmp/cj.txt -X POST http://localhost:5000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"teacher@example.com","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')
echo "$TOKEN" | head -c 20; echo " ...(token captured)"
```

- [ ] **Step 3: `GET /api/auth/me` with the token**

```bash
curl -s http://localhost:5000/api/auth/me -H "Authorization: Bearer $TOKEN"
```
Expected: `{"id":...,"email":"teacher@example.com","role":"TEACHER"}`.

- [ ] **Step 4: `GET /api/users/me` returns profile**

```bash
curl -s http://localhost:5000/api/users/me -H "Authorization: Bearer $TOKEN"
```
Expected: `{"id":...,"email":"teacher@example.com","role":"TEACHER","profile":{"id":...,"firstName":"Tessa","lastName":"Teacher",...}}`.

- [ ] **Step 5: Unauthorized check**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/api/users/me
```
Expected: `401`.

- [ ] **Step 6: Refresh rotates the token using the cookie**

```bash
curl -s -i -b /tmp/cj.txt -c /tmp/cj.txt -X POST http://localhost:5000/api/auth/refresh
```
Expected: `HTTP/1.1 200`, body `{"accessToken":"..."}`, and a new `Set-Cookie: refreshToken=...`.

- [ ] **Step 7: Validation rejection check (bad register body)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5000/api/auth/register -H 'Content-Type: application/json' -d '{"email":"not-an-email","password":"x"}'
```
Expected: `400` (class-validator rejects invalid email + short password). Optionally inspect body shows `{"message":"Validation error","errors":[...]}`.

- [ ] **Step 8: Logout clears the session**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -b /tmp/cj.txt -X POST http://localhost:5000/api/auth/logout
```
Expected: `204`.

- [ ] **Step 9: Confirm a Session row exists after login (DB check)**

```bash
/Applications/Postgres.app/Contents/Versions/latest/bin/psql -h localhost -p 5432 -U macbookpro -d magistrdiplom -tAc 'select count(*) from "Session";'
```
Expected: a number >= 1 (login created sessions).

- [ ] **Step 10: Stop the background server**

```bash
pkill -f "nest start" || pkill -f "start:dev" || true
```

No commit (verification only).

---

## Self-Review (author checklist — completed)

- **Spec coverage:** Foundation (Prisma, config, filter, guards → Tasks 2–5, 8), Auth (register/login/refresh/logout/me → Task 6), Users (me, me/profile upload, me/courses → Task 7). Matches the legacy contract: `/api` prefix, Bearer access token, `refreshToken` httpOnly cookie (sameSite strict, secure false, 30d), SHA-256 session hashing with rotation, role guard messages (`Unauthorized`/`Forbidden`), `{message, errors}` error envelope, avatar upload to `public/avatars` served at `/public/avatars/...`. ✓
- **Intentional deltas from legacy (documented):** (1) Access token now carries `email` so `/api/auth/me` returns a real email (legacy returned `undefined`). (2) CORS origin is the Next dev server `http://localhost:3000` instead of Vite `5173`. (3) Validation via class-validator yields `{message:'Validation error', errors:[...]}`. These are improvements consistent with the design spec.
- **Placeholder scan:** No TBD/TODO; every file has complete code. ✓
- **Type consistency:** `AuthUser`/`UserRole` defined once in `current-user.decorator.ts` and imported everywhere; `durationToMs` signature matches usage; `REFRESH_COOKIE`/options consistent across controller methods. ✓
- **Deferred to Plan 2b/2c:** Courses, Sections, Lessons, Enrollments (2b); Tests, Course Progress (2c). The `public/courses` dir is created here for 2b.
