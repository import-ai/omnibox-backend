import { Expose } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import {
  ToolbarSortBy,
  ToolbarSortOrder,
} from 'omniboxd/toolbar/entities/toolbar.entity';

export class UpdateToolbarPreferenceDto {
  @Expose({ name: 'sort_by' })
  @IsOptional()
  @IsEnum(ToolbarSortBy, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  sortBy?: ToolbarSortBy;

  @Expose({ name: 'sort_order' })
  @IsOptional()
  @IsEnum(ToolbarSortOrder, {
    message: i18nValidationMessage('validation.errors.isEnum'),
  })
  sortOrder?: ToolbarSortOrder;
}
