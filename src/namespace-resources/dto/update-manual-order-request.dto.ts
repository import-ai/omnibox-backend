import { Expose } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class UpdateManualOrderRequestDto {
  @Expose({ name: 'resource_ids' })
  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @IsString({
    each: true,
    message: i18nValidationMessage('validation.errors.isString'),
  })
  resourceIds?: string[];

  @Expose({ name: 'resource_id' })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  resourceId?: string;

  @Expose({ name: 'target_index' })
  @IsOptional()
  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(0, { message: i18nValidationMessage('validation.errors.min') })
  targetIndex?: number;

  @Expose({ name: 'before_resource_id' })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  beforeResourceId?: string;

  @Expose({ name: 'after_resource_id' })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  afterResourceId?: string;

  @Expose({ name: 'switch_to_manual' })
  @IsOptional()
  @IsBoolean({
    message: i18nValidationMessage('validation.errors.isBoolean'),
  })
  switchToManual?: boolean;
}
