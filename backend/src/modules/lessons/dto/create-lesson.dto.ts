import { IsOptional, IsString } from 'class-validator';

export class CreateLessonDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;
}
