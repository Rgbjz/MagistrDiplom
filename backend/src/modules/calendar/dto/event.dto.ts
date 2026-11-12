import { CourseEventKind } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateCourseEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(CourseEventKind)
  kind?: CourseEventKind;

  @IsDateString()
  startsAt: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  endsAt?: string | null;
}

export class UpdateCourseEventDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsEnum(CourseEventKind)
  kind?: CourseEventKind;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  endsAt?: string | null;
}

export class CalendarRangeDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class DevRemindDto {
  @IsEnum(['assignment', 'event'] as const)
  kind: 'assignment' | 'event';

  @IsInt()
  @Min(1)
  id: number;
}
