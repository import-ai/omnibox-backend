import { IsOptional, IsEmail, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateUserBindingDto {
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  loginId: string;

  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  loginType: string;

  @IsString({
    message: i18nValidationMessage('validation.errors.username.isString'),
  })
  username: string;

  @IsEmail(
    {},
    { message: i18nValidationMessage('validation.errors.email.isEmail') },
  )
  @IsOptional()
  email: string;

  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsOptional()
  lang?: string;
}
