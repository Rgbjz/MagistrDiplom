import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { QUESTION_TYPES, type QType } from '../question-types';

export class CreateQuestionDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsIn([...QUESTION_TYPES])
  type?: QType;

  @IsOptional()
  @IsInt()
  difficulty?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  points?: number;

  @IsOptional()
  @IsBoolean()
  partialCredit?: boolean;

  // Type-specific settings (accepted answers, numeric value, pairs, items, essay limits).
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
