import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MinLength,
  MaxLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class UpdateNamespaceDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  @IsOptional()
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.name.isNotEmpty'),
  })
  @MinLength(2, {
    message: i18nValidationMessage('validation.errors.name.minLength'),
  })
  @MaxLength(64, {
    message: i18nValidationMessage('validation.errors.name.maxLength'),
  })
  name?: string;
}
