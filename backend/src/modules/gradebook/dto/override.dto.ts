import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SetOverrideDto {
  @Type(() => Number)
  @IsInt()
  userId: number;

  @IsString()
  @Matches(/^(test-\d+|assignment-\d+|final)$/)
  itemKey: string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  value: number;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}
