import { Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsString,
  ValidateNested,
} from 'class-validator';
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

export class VisibleResourceInputDto {
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  id: string;

  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  name: string;

  @IsIn(['resource', 'folder'], {
    message: i18nValidationMessage('validation.errors.isIn'),
  })
  type: 'resource' | 'folder';
}

export class ExpandVisibleResourcesRequestDto {
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @ValidateNested({ each: true })
  @Type(() => VisibleResourceInputDto)
  resources: VisibleResourceInputDto[];
}
