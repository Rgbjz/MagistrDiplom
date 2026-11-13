import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

/** Max members of a group chat (calls in it are still limited to 6 people). */
export const MAX_GROUP_MEMBERS = 50;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateGroupDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_GROUP_MEMBERS - 1)
  @ArrayUnique()
  @IsInt({ each: true })
  memberIds: number[];
}

export class RenameGroupDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title: string;
}

export class AddMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_GROUP_MEMBERS - 1)
  @ArrayUnique()
  @IsInt({ each: true })
  userIds: number[];
}
