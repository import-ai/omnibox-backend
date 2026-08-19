import { IsArray, IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';

import { ConversationShareChannel } from '../entities/conversation-share-event.entity';

export class CreateConversationShareDto {
  @IsEnum(ConversationShareChannel)
  channel: ConversationShareChannel;

  @IsUUID()
  conversation_id: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  group_ids: string[];
}
