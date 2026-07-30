import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

import { RssLinkRequestDto } from './rss-link-request.dto';

export class UpdateRssFolderRequestDto {
  @IsOptional()
  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.name.isNotEmpty'),
  })
  @MaxLength(128, {
    message: i18nValidationMessage('validation.errors.name.maxLength'),
  })
  name?: string;

  @IsOptional()
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @ArrayMinSize(1, {
    message: i18nValidationMessage('validation.errors.isArray'),
  })
  @ValidateNested({ each: true })
  @Type(() => RssLinkRequestDto)
  links?: RssLinkRequestDto[];
}
