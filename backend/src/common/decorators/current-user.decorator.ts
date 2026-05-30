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
