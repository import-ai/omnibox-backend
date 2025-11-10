import {
  IsEnum,
  IsArray,
  IsObject,
  IsString,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

export class UpdateResourceDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  @IsOptional()
  name?: string;

  @IsString({
    message: i18nValidationMessage('validation.errors.namespaceId.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.namespaceId.isNotEmpty'),
  })
  namespaceId: string;

  @IsEnum(ResourceType, {
    message: i18nValidationMessage('validation.errors.resourceType.isEnum'),
  })
  @IsOptional()
  resourceType?: ResourceType;

  @IsString({
    message: i18nValidationMessage('validation.errors.parentId.isString'),
  })
  @IsOptional()
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.parentId.isNotEmpty'),
  })
  parentId?: string;

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
  @IsOptional()
  content?: string;

  @IsObject({ message: i18nValidationMessage('validation.errors.isObject') })
  @IsOptional()
  attrs?: Record<string, any>;
}
