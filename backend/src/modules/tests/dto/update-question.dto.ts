import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateQuestionDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsIn(['SINGLE', 'MULTIPLE'])
  type?: 'SINGLE' | 'MULTIPLE';

  @IsOptional()
  @IsInt()
  difficulty?: number;
}
