import { Expose } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsDateString,
  IsInt,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ShareType } from '../entities/share.entity';

export class UpdateShareInfoReqDto {
  @IsOptional()
  @IsBoolean({
    message: i18nValidationMessage('validation.errors.enabled.isBoolean'),
  })
  @Expose({ name: 'enabled' })
  enabled?: boolean;

  @IsOptional()
  @IsBoolean({
    message: i18nValidationMessage('validation.errors.allResources.isBoolean'),
  })
  @Expose({ name: 'all_resources' })
  allResources?: boolean;

  @IsOptional()
  @IsBoolean({
    message: i18nValidationMessage('validation.errors.requireLogin.isBoolean'),
  })
  @Expose({ name: 'require_login' })
  requireLogin?: boolean;

  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @Expose({ name: 'password' })
  password?: string | null;

  @IsOptional()
  @IsEnum(ShareType, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  @Expose({ name: 'share_type' })
  shareType?: ShareType;

  @IsOptional()
  @IsDateString(
    {},
    { message: i18nValidationMessage('validation.errors.isDateString') },
  )
  @Expose({ name: 'expires_at' })
  expiresAt?: Date | null;

  @IsOptional()
  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Expose({ name: 'expires_seconds' })
  expiresSeconds?: number;
}
