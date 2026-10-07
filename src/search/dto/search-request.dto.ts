import { Expose, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  SmartFolderCondition,
  SmartFolderMatchMode,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';

import { DocType } from '../doc-type.enum';

export class SearchRequestDto {
  @Expose({ name: 'exclude_conversation_id' })
  @IsString()
  @IsOptional()
  excludeConversationId?: string;

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

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}

export class ConversationMessageSearchRequestDto {
  @IsString()
  query: string;

  @Expose({ name: 'conversation_ids' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  conversationIds?: string[];

  @Expose({ name: 'exclude_conversation_ids' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  excludeConversationIds?: string[];

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
