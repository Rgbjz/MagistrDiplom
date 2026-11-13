import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class UpdateAdaptiveSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0.3)
  @Max(0.9)
  masteryThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(1)
  accelerationThreshold?: number;

  @IsOptional()
  @IsBoolean()
  adaptiveTestsDefault?: boolean;

  @IsOptional()
  @IsIn(['OFF', 'AB_TEST'])
  experimentMode?: 'OFF' | 'AB_TEST';
}

export class OpenedDto {
  @IsNumber()
  courseId: number;
}
