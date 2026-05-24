import { Expose, Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  ResourceSortBy,
  ResourceSortOrder,
} from 'omniboxd/resources/resource-sort.types';

export class ListChildrenRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(0)
  offset?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean({ message: i18nValidationMessage('validation.errors.isBoolean') })
  summary?: boolean;

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
