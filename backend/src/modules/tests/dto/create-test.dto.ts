import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateTestDto {
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
