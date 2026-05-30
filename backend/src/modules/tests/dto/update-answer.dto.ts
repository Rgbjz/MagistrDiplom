import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateAnswerDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;
}
