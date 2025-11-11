import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateUserDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.username.isString'),
  })
  @MinLength(2, {
    message: i18nValidationMessage('validation.errors.username.minLength'),
  })
  @MaxLength(32, {
    message: i18nValidationMessage('validation.errors.username.maxLength'),
  })
  username: string;

  @IsEmail(
    {},
    { message: i18nValidationMessage('validation.errors.email.isEmail') },
  )
  @IsOptional()
  email: string;

  @IsString({
    message: i18nValidationMessage('validation.errors.password.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.password.isNotEmpty'),
  })
  password: string;

  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsOptional()
  lang?: string;
}
