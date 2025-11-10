import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateNamespaceDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.name.isNotEmpty'),
  })
  @MinLength(2, {
    message: i18nValidationMessage('validation.errors.name.minLength'),
  })
  @MaxLength(64, {
    message: i18nValidationMessage('validation.errors.name.maxLength'),
  })
  name: string;
}
