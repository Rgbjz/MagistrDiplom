import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ROLES } from './admin-users-query.dto';
import type { RoleValue } from './admin-users-query.dto';

export class AdminUpdateUserDto {
  @IsOptional()
  @IsIn(ROLES)
  role?: RoleValue;

  @IsOptional()
  @IsBoolean()
  blocked?: boolean;

  /** Confirm the email by hand (e.g. while no SMTP is configured). */
  @IsOptional()
  @IsIn([true])
  emailVerified?: true;
}
