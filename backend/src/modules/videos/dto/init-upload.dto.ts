import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class InitUploadDto {
  @IsInt()
  @Min(1)
  size: number;

  @IsString()
  @MaxLength(100)
  mime: string;

  @IsString()
  @MaxLength(255)
  name: string;
}
