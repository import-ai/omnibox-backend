import { IsString, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class UpdateUserBindingDto {
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  loginId: string;

  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  loginType: string;

  @IsString({
    message: i18nValidationMessage('validation.errors.userId.isString'),
  })
  userId: string;

  @IsOptional()
  metadata?: Record<string, any>;
}
