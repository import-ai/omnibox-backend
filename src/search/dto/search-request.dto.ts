import { Expose } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import {
  SmartFolderCondition,
  SmartFolderMatchMode,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
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
}
