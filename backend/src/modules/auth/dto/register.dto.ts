import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsIn(['TEACHER', 'STUDENT'])
  role?: 'TEACHER' | 'STUDENT';

  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  /** Interface language chosen before sign-up; used for emails. */
  @IsOptional()
  @IsIn(['uk', 'en', 'pl'])
  locale?: 'uk' | 'en' | 'pl';
}
