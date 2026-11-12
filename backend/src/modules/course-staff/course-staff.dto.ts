import { IsEmail, IsIn, IsInt, Min } from 'class-validator';

export const ASSIGNABLE_ROLES = ['TEACHER', 'ASSISTANT'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export class AddStaffDto {
  @IsEmail()
  email: string;

  @IsIn(ASSIGNABLE_ROLES)
  role: AssignableRole;
}

export class UpdateStaffDto {
  @IsIn(ASSIGNABLE_ROLES)
  role: AssignableRole;
}

export class TransferOwnershipDto {
  @IsInt()
  @Min(1)
  userId: number;
}
