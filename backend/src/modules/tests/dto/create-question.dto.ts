import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  text: string;

  @IsOptional()
  @IsIn(['SINGLE', 'MULTIPLE'])
  type?: 'SINGLE' | 'MULTIPLE';

  @IsOptional()
  @IsInt()
  difficulty?: number;
}
