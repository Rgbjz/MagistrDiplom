import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ToBoolean } from '../../../common/utils/transform';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  emailNotifications?: boolean;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  deadlineReminders?: boolean;

  @IsOptional()
  @IsIn(['uk', 'en', 'pl'])
  locale?: 'uk' | 'en' | 'pl';
}
