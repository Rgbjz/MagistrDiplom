import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAssignmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  /** ISO date-time; null clears the deadline. */
  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxScore?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxFiles?: number;
}

export class UpdateAssignmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxScore?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxFiles?: number;
}

export class SubmitAssignmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string;
}

export class GradeSubmissionDto {
  @IsInt()
  @Min(0)
  score: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  feedback?: string;
}

export class ReturnSubmissionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  feedback: string;
}
