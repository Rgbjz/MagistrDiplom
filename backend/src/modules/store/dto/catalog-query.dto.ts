import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EmptyToUndefined } from '../../../common/utils/transform';
import { COURSE_LEVELS } from '../../courses/dto/create-course.dto';
import type { CourseLevelValue } from '../../courses/dto/create-course.dto';

export const CATALOG_SORTS = [
  'new',
  'popular',
  'price_asc',
  'price_desc',
] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export class CatalogQueryDto {
  @IsOptional()
  @EmptyToUndefined()
  @IsString()
  @MaxLength(100)
  search?: string;

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
  @EmptyToUndefined()
  @IsIn(['free', 'paid'])
  price?: 'free' | 'paid';

  @IsOptional()
  @EmptyToUndefined()
  @IsIn(CATALOG_SORTS)
  sort?: CatalogSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  pageSize?: number;
}
