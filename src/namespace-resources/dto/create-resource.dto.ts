import {
  IsEnum,
  IsArray,
  IsString,
  IsObject,
  IsOptional,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

export class CreateResourceDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  @IsOptional()
  name: string;

  @IsEnum(ResourceType, {
    message: i18nValidationMessage('validation.errors.resourceType.isEnum'),
  })
  resourceType: ResourceType;

  @IsString({
    message: i18nValidationMessage('validation.errors.parentId.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.parentId.isNotEmpty'),
  })
  parentId: string;

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

  @ValidateIf((o) => o.resourceType === ResourceType.FILE)
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  file_id?: string;
}
