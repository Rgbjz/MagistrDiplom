import { IsOptional, IsString } from 'class-validator';

export class CreateSectionDto {
  @IsOptional()
  @IsString()
  title?: string;
}
