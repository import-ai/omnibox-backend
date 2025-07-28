import { MessageStatus } from 'omniboxd/messages/entities/message.entity';
import { BaseDto } from 'omniboxd/common/base.dto';

export interface ConversationMessageMappingDto extends BaseDto {
  id: string;
  message: Record<string, any>;
  status: MessageStatus;
  parent_id?: string;
  children: string[];
  attrs?: Record<string, any>;
}

export interface ConversationDetailDto extends BaseDto {
  id: string;
  title?: string;
  mapping: Record<string, ConversationMessageMappingDto>;
  current_node?: string;
}
