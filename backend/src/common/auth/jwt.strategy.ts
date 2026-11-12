import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser, UserRole } from '../decorators/current-user.decorator';

interface JwtPayload {
  id: number;
  role: UserRole;
  email?: string;
  sid?: number;
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
    return {
      id: payload.id,
      role: payload.role,
      email: payload.email,
      sid: payload.sid,
    };
  }
}
