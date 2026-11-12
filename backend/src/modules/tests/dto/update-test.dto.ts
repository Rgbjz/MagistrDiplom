import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateTestDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsInt()
  timeLimit?: number;

  @IsOptional()
  @IsInt()
  passingScore?: number;

  @IsOptional()
  @IsBoolean()
  shuffleQuestions?: boolean;

  @IsOptional()
  @IsBoolean()
  shuffleAnswers?: boolean;

  // null = unlimited
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(100)
  maxAttempts?: number | null;

  // null = all questions of the test
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(200)
  questionsPerAttempt?: number | null;

  @IsOptional()
  @IsIn(['NEVER', 'AFTER_SUBMIT', 'AFTER_PASS', 'AFTER_CLOSE'])
  showCorrectAnswers?: 'NEVER' | 'AFTER_SUBMIT' | 'AFTER_PASS' | 'AFTER_CLOSE';
}
