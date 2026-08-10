import { Expose } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

import { ResourceSortBy, ResourceSortOrder } from '../resource-sort';

export class ResourceSortRequestDto {
  @Expose({ name: 'sort_by' })
  @IsOptional()
  @IsEnum(ResourceSortBy, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  sortBy?: ResourceSortBy;

  @Expose({ name: 'sort_order' })
  @IsOptional()
  @IsEnum(ResourceSortOrder, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  sortOrder?: ResourceSortOrder;
}
