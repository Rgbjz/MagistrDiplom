import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { EmptyToUndefined, ToBoolean } from '../../../common/utils/transform';

export const COURSE_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type CourseLevelValue = (typeof COURSE_LEVELS)[number];

export class CreateCourseDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @EmptyToUndefined()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @EmptyToUndefined()
  @IsIn(COURSE_LEVELS)
  level?: CourseLevelValue;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  autoApprove?: boolean;
}
