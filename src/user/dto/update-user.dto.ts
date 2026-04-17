import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { Transform } from 'class-transformer';
import { IsAllowedEmailDomain } from 'omniboxd/utils/email-validation';

export class UpdateUserDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.username.isString'),
  })
  @MinLength(2, {
    message: i18nValidationMessage('validation.errors.username.minLength'),
  })
  @MaxLength(32, {
    message: i18nValidationMessage('validation.errors.username.maxLength'),
  })
  @IsOptional()
  username?: string;

  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsEmail(
    {},
    { message: i18nValidationMessage('validation.errors.email.isEmail') },
  )
  @IsAllowedEmailDomain({
    message: i18nValidationMessage('validation.errors.email.domainNotAllowed'),
  })
  @IsOptional()
  email?: string;

  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsOptional()
  code?: string;

  @IsString({
    message: i18nValidationMessage('validation.errors.password.isString'),
  })
  @IsOptional()
  password?: string;
}
