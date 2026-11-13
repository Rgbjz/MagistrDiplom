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
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { authLimit, THROTTLE_TTL } from '../../common/throttle/throttle';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ConfirmDto } from './dto/confirm.dto';
import { EmailDto } from './dto/email.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

const REFRESH_COOKIE = 'refreshToken';
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

// Brute-force protection: a tight per-IP limit on credential endpoints.
const AUTH_THROTTLE = {
  default: { limit: () => authLimit(), ttl: THROTTLE_TTL },
};

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  // POST defaults to 201 in Nest — matches legacy register status.
  @Post('register')
  @Throttle(AUTH_THROTTLE)
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('confirm')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  confirm(@Body() dto: ConfirmDto) {
    return this.auth.confirm(dto.token);
  }

  @Post('resend-confirmation')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  resendConfirmation(@Body() dto: EmailDto) {
    return this.auth.resendConfirmation(dto.email);
  }

  @Post('forgot-password')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  forgotPassword(@Body() dto: EmailDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Post('login')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...data } = await this.auth.login(dto, {
      // The Next.js server forwards the browser's user agent when it can.
      userAgent:
        (req.headers['x-client-user-agent'] as string | undefined) ??
        req.headers['user-agent'],
      ip:
        (req.headers['x-forwarded-for'] as string | undefined)
          ?.split(',')[0]
          ?.trim() ?? req.ip,
    });
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
    // null: the previous token was accepted and the client keeps its own.
    if (refreshToken)
      res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS);
    return { accessToken };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
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
