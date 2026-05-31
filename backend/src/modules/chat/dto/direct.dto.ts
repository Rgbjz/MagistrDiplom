import { IsInt } from 'class-validator';

export class DirectDto {
  @IsInt()
  userId: number;
}
