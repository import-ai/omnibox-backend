import { IsEmail, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IsAllowedEmailDomain } from 'omniboxd/utils/email-validation';

export class ValidateEmailDto {
  @Transform(({ value }) => value?.toLowerCase?.())
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.email.isNotEmpty'),
  })
  @IsEmail(
    {},
    { message: i18nValidationMessage('validation.errors.email.isEmail') },
  )
  @IsAllowedEmailDomain({
    message: i18nValidationMessage('validation.errors.email.domainNotAllowed'),
  })
  email: string;
}
