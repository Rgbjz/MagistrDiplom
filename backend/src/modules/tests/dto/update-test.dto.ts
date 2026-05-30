import { IsInt, IsOptional, IsString } from 'class-validator';

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
}
