import { IsString, MaxLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateTagDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  @MaxLength(20, {
    message: i18nValidationMessage('validation.errors.name.maxLength'),
  })
  name: string;
}
