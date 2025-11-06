import { IsString, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateUserOptionDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  @MaxLength(64, {
    message: i18nValidationMessage('validation.errors.name.maxLength'),
  })
  name: string;

  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  value: string;
}
