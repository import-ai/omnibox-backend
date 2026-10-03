import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

import { ConversationShareChannel } from '../entities/conversation-share-event.entity';

export class CreateConversationShareDto {
  @IsEnum(ConversationShareChannel)
  channel: ConversationShareChannel;

  @IsUUID()
  conversation_id: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  answer_ids?: string[];

  @IsOptional()
  @IsBoolean()
  select_all?: boolean;

  @IsOptional()
  @IsUUID()
  branch_leaf_id?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  excluded_answer_ids?: string[];

  /** Legacy question IDs used by released mobile clients. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  group_ids?: string[];
}
