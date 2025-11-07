import { Expose } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class LoginPayloadDto {
  @Expose()
  @IsString({
    message: i18nValidationMessage('validation.errors.email.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.email.isNotEmpty'),
  })
  email: string;

  @Expose()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  sub: string;
}
