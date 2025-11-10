import { IsNotEmpty, IsString, IsObject } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class TraceEventDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.name.isNotEmpty'),
  })
  name: string;

  @IsObject({ message: i18nValidationMessage('validation.errors.isObject') })
  props: Record<string, any>;
}
