import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { EmptyToUndefined } from '../../../common/utils/transform';

export const ROLES = ['STUDENT', 'TEACHER', 'ADMIN'] as const;
export type RoleValue = (typeof ROLES)[number];

export class AdminUsersQueryDto {
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsIn(ROLES)
  role?: RoleValue;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
