import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class OpenCollectRequestDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.url.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.url.isNotEmpty'),
  })
  url: string;

  @IsString({
    message: i18nValidationMessage('validation.errors.title.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.title.isNotEmpty'),
  })
  title: string;

  @IsString({
    message: i18nValidationMessage('validation.errors.parentId.isString'),
  })
  @IsOptional()
  parentId?: string;
}
