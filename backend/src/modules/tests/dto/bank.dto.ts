import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CategoryDto {
  @IsString()
  @MaxLength(120)
  name: string;
}

export class ImportGiftDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsInt()
  categoryId?: number;
}

export class CopyFromBankDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  questionIds: number[];
}

export class RandomRuleDto {
  @IsInt()
  categoryId: number;

  @IsInt()
  @Min(0)
  count: number;
}

export class RandomRulesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RandomRuleDto)
  rules: RandomRuleDto[];
}

export class GradeEssayDto {
  @IsNumber()
  @Min(0)
  points: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  feedback?: string;
}
