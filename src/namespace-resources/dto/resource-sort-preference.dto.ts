import { Expose } from 'class-transformer';
import { IsEnum } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  ResourceSortBy,
  ResourceSortOrder,
  ResourceSortSpaceType,
} from 'omniboxd/resources/resource-sort';

export class UpdateResourceSortPreferenceDto {
  @Expose({ name: 'space_type' })
  @IsEnum(ResourceSortSpaceType, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  spaceType: ResourceSortSpaceType;

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
}

export class ResourceSortPreferenceResponseDto {
  spaceType: ResourceSortSpaceType;
  sortBy: ResourceSortBy;
  sortOrder: ResourceSortOrder;

  static fromValues(
    spaceType: ResourceSortSpaceType,
    sortBy: ResourceSortBy,
    sortOrder: ResourceSortOrder,
  ): ResourceSortPreferenceResponseDto {
    const dto = new ResourceSortPreferenceResponseDto();
    dto.spaceType = spaceType;
    dto.sortBy = sortBy;
    dto.sortOrder = sortOrder;
    return dto;
  }
}

export type ResourceSortPreferencesResponseDto = Record<
  ResourceSortSpaceType,
  ResourceSortPreferenceResponseDto
>;
