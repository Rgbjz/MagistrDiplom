import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN';

export interface AuthUser {
  id: number;
  role: UserRole;
  email?: string;
  /** Session id of the current access token (absent in tokens issued before sids). */
  sid?: number;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
