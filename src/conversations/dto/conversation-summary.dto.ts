import { BaseDto } from 'omniboxd/common/base.dto';
import { OpenAIMessageRole } from 'omniboxd/messages/entities/message.entity';

export interface ConversationSummaryMessageDto {
  role: OpenAIMessageRole.USER | OpenAIMessageRole.ASSISTANT;
  content: string;
}

export interface ConversationSummaryDto extends BaseDto {
  id: string;
  title?: string;
  user_content?: string;
  assistant_content?: string;
  last_message?: ConversationSummaryMessageDto;
}
