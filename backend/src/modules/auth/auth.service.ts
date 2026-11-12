import {
  BadRequestException,
  HttpException,
  HttpStatus,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { durationToMs } from '../../common/utils/duration';
import { UserRole } from '../../common/decorators/current-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const RESET_TTL_MS = 60 * 60 * 1000;

export interface ClientInfo {
  userAgent?: string;
  ip?: string;
}

interface JwtPayload {
  id: number;
  role: UserRole;
  email?: string;
  /** Session row id — identifies «this device» and makes tokens session-bound. */
  sid?: number;
}

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // Every token gets a random jti, so two logins in the same second never
  // produce identical tokens (and identical refresh-token hashes).
  private signAccess(payload: JwtPayload): string {
    return this.jwt.sign(
      { ...payload, jti: crypto.randomUUID() },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: (this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ??
          '15m') as JwtSignOptions['expiresIn'],
      },
    );
  }

  private signRefresh(payload: JwtPayload): string {
    return this.jwt.sign(
      { ...payload, jti: crypto.randomUUID() },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
          '30d') as JwtSignOptions['expiresIn'],
      },
    );
  }

  private refreshTtlMs(): number {
    return durationToMs(
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d',
    );
  }

  private async createAuthResponse(
    user: {
      id: number;
      email: string;
      role: UserRole;
    },
    client: ClientInfo = {},
  ) {
    // The session row comes first so its id can be embedded in both tokens.
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: `pending-${crypto.randomUUID()}`,
        expiresAt: new Date(Date.now() + this.refreshTtlMs()),
        userAgent: client.userAgent?.slice(0, 300) ?? null,
        ip: client.ip ?? null,
      },
    });
    const payload: JwtPayload = {
      id: user.id,
      role: user.role,
      email: user.email,
      sid: session.id,
    };
    const accessToken = this.signAccess(payload);
    const refreshToken = this.signRefresh(payload);
    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: this.hashToken(refreshToken) },
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
    const confirmToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.user.create({
      data: {
        email: dto.email,
        password: await bcrypt.hash(dto.password, 10),
        role: dto.role === 'TEACHER' ? 'TEACHER' : 'STUDENT',
        emailVerified: false,
        verificationToken: confirmToken,
        profile: {
          create: {
            firstName: dto.firstName?.trim() || null,
            lastName: dto.lastName?.trim() || null,
            locale: dto.locale ?? 'uk',
          },
        },
      },
    });
    this.mail.sendConfirmation(dto.email, confirmToken, dto.locale);
    return {
      email: dto.email,
      emailSent: this.mail.enabled,
      ...(this.mail.enabled ? {} : { confirmToken }),
    };
  }

  async confirm(token: string) {
    if (!token) {
      throw new BadRequestException('Invalid or used confirmation link');
    }
    const user = await this.prisma.user.findUnique({
      where: { verificationToken: token },
    });
    if (!user) {
      throw new BadRequestException('Invalid or used confirmation link');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationToken: null },
    });
    return { ok: true };
  }

  async resendConfirmation(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { profile: { select: { locale: true } } },
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (user.emailVerified) {
      throw new BadRequestException('Email already confirmed');
    }
    const confirmToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { verificationToken: confirmToken },
    });
    this.mail.sendConfirmation(email, confirmToken, user.profile?.locale);
    return {
      email,
      emailSent: this.mail.enabled,
      ...(this.mail.enabled ? {} : { confirmToken }),
    };
  }

  /** Always succeeds so the endpoint doesn't reveal which emails exist. */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { profile: { select: { locale: true } } },
    });
    if (!user) {
      return {
        emailSent: this.mail.enabled,
        ...(this.mail.enabled ? {} : { resetToken: null }),
      };
    }
    const resetToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpires: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    this.mail.sendPasswordReset(email, resetToken, user.profile?.locale);
    return {
      emailSent: this.mail.enabled,
      ...(this.mail.enabled ? {} : { resetToken }),
    };
  }

  async resetPassword(token: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { resetToken: token },
    });
    if (!user) {
      throw new BadRequestException('Invalid or used reset link');
    }
    if (!user.resetTokenExpires || user.resetTokenExpires < new Date()) {
      throw new BadRequestException('Reset link expired');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          password: await bcrypt.hash(password, 10),
          resetToken: null,
          resetTokenExpires: null,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      // A password reset signs the user out everywhere.
      this.prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);
    return { ok: true };
  }

  async login(dto: LoginDto, client: ClientInfo = {}) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException('Account temporarily locked', HttpStatus.LOCKED);
    }
    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      // Moodle-style lockout: after MAX_FAILED_LOGINS consecutive wrong
      // passwords the account is locked for LOCKOUT_MINUTES.
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: lock ? 0 : failed,
          lockedUntil: lock
            ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
            : user.lockedUntil,
        },
      });
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }
    if (user.blocked) {
      throw new ForbiddenException('Account blocked');
    }
    if (!user.emailVerified) {
      throw new ForbiddenException('Email not confirmed');
    }
    return this.createAuthResponse(user, client);
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

    const hash = this.hashToken(refreshToken);
    const session = payload.sid
      ? await this.prisma.session.findUnique({ where: { id: payload.sid } })
      : await this.prisma.session.findFirst({
          where: { userId: payload.id, refreshTokenHash: hash },
        });
    if (
      !session ||
      session.userId !== payload.id ||
      session.refreshTokenHash !== hash ||
      session.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Session expired');
    }
    const owner = await this.prisma.user.findUnique({
      where: { id: payload.id },
      select: { blocked: true, role: true },
    });
    if (!owner || owner.blocked) {
      throw new UnauthorizedException('Account blocked');
    }

    const clean: JwtPayload = {
      id: payload.id,
      role: owner.role,
      email: payload.email,
      sid: session.id,
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
