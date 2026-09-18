import { Expose } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export const MAX_VISIBLE_RESOURCE_IDS = 200;

export class VisibleResourcesRequestDto {
  @Expose({ name: 'resource_ids' })
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @ArrayMaxSize(MAX_VISIBLE_RESOURCE_IDS, {
    message: i18nValidationMessage('validation.errors.arrayMaxSize'),
  })
  @IsString({
    each: true,
    message: i18nValidationMessage('validation.errors.isString'),
  })
  resourceIds: string[];
}
