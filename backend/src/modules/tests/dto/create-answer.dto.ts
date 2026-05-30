import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateAnswerDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;
}
