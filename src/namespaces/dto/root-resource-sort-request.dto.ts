import { Expose } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ResourceSortRequestDto } from 'omniboxd/resources/dto/resource-sort-request.dto';
import {
  ResourceSortBy,
  ResourceSortOrder,
} from 'omniboxd/resources/resource-sort';

export class RootResourceSortRequestDto extends ResourceSortRequestDto {
  @Expose({ name: 'private_sort_by' })
  @IsOptional()
  @IsEnum(ResourceSortBy, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  privateSortBy?: ResourceSortBy;

  @Expose({ name: 'private_sort_order' })
  @IsOptional()
  @IsEnum(ResourceSortOrder, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  privateSortOrder?: ResourceSortOrder;

  @Expose({ name: 'teamspace_sort_by' })
  @IsOptional()
  @IsEnum(ResourceSortBy, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  teamspaceSortBy?: ResourceSortBy;

  @Expose({ name: 'teamspace_sort_order' })
  @IsOptional()
  @IsEnum(ResourceSortOrder, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  teamspaceSortOrder?: ResourceSortOrder;
}
