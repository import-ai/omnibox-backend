import { Expose, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  ResourceSortBy,
  ResourceSortOrder,
} from 'omniboxd/resources/resource-sort';

export class InitializeManualSortRequestDto {
  @Expose({ name: 'sort_by' })
  @IsEnum(ResourceSortBy, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  sortBy: ResourceSortBy;

  @Expose({ name: 'sort_order' })
  @IsEnum(ResourceSortOrder, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  sortOrder: ResourceSortOrder;

  @IsOptional()
  @IsBoolean({ message: i18nValidationMessage('validation.errors.isBoolean') })
  overwrite?: boolean;
}

export class ParentResourceOrderDto {
  @Expose({ name: 'parent_id' })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  parentId: string;

  @Expose({ name: 'resource_ids' })
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @ArrayUnique()
  @IsString({
    each: true,
    message: i18nValidationMessage('validation.errors.isString'),
  })
  resourceIds: string[];
}

export class UpdateManualSortRequestDto {
  @Expose({ name: 'root_resource_id' })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  rootResourceId: string;

  @Expose({ name: 'resource_id' })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  resourceId?: string;

  @Expose({ name: 'target_parent_id' })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  targetParentId?: string;

  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ParentResourceOrderDto)
  orders: ParentResourceOrderDto[];
}
