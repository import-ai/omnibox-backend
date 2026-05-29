import { Expose } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import {
  SmartFolderCondition,
  SmartFolderMatchMode,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import {
  ResourceSortBy,
  ResourceSortOrder,
} from 'omniboxd/resources/resource-sort.types';
import { DocType } from '../doc-type.enum';

export class SearchRequestDto {
  @IsString()
  @IsOptional()
  query?: string;

  @IsEnum(DocType)
  @IsOptional()
  type?: DocType;

  @Expose({ name: 'match_mode' })
  @IsEnum(SmartFolderMatchMode)
  @IsOptional()
  matchMode?: SmartFolderMatchMode;

  @IsArray()
  @IsOptional()
  conditions?: SmartFolderCondition[];

  @Expose({ name: 'sort_by' })
  @IsEnum(ResourceSortBy)
  @IsOptional()
  sortBy?: ResourceSortBy;

  @Expose({ name: 'sort_order' })
  @IsEnum(ResourceSortOrder)
  @IsOptional()
  sortOrder?: ResourceSortOrder;
}
