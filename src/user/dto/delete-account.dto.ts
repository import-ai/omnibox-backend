import { IsString, MinLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class InitiateAccountDeletionDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.username.isString'),
  })
  @MinLength(2, {
    message: i18nValidationMessage('validation.errors.username.minLength'),
  })
  username: string;
}

export class ConfirmAccountDeletionDto {
  @IsString()
  token: string;
}
