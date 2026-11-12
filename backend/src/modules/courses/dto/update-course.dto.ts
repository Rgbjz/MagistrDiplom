import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EmptyToUndefined, ToBoolean } from '../../../common/utils/transform';
import { COURSE_LEVELS } from './create-course.dto';
import type { CourseLevelValue } from './create-course.dto';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

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

  // Gradebook settings (multipart sends numbers as strings).
  @IsOptional()
  @EmptyToUndefined()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  testsWeight?: number;

  @IsOptional()
  @EmptyToUndefined()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  assignmentsWeight?: number;

  @IsOptional()
  @EmptyToUndefined()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  gradePassThreshold?: number;

  @IsOptional()
  @IsIn(['PERCENT', 'FIVE_POINT', 'ECTS', 'PASS_FAIL'])
  gradingScale?: 'PERCENT' | 'FIVE_POINT' | 'ECTS' | 'PASS_FAIL';

  // JSON array of { code, min } bands; '' resets to the scale's defaults.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  gradingScaleConfig?: string;
}
