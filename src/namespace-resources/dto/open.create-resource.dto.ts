import {
  IsArray,
  IsString,
  IsObject,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class OpenCreateResourceDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  @IsOptional()
  name?: string;

  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @IsOptional()
  @IsString({
    each: true,
    message: i18nValidationMessage('validation.errors.isString'),
  })
  tag_ids?: string[];

  @IsString({
    message: i18nValidationMessage('validation.errors.content.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.content.isNotEmpty'),
  })
  content: string;

  @IsObject({ message: i18nValidationMessage('validation.errors.isObject') })
  @IsOptional()
  attrs?: Record<string, any>;

  @IsBoolean({ message: i18nValidationMessage('validation.errors.isBoolean') })
  @IsOptional()
  skip_parsing_tags_from_content?: boolean;
}
