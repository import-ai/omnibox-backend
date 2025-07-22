import { BaseDto } from 'omnibox-backend/common/base.dto';

export interface ConversationSummaryDto extends BaseDto {
  id: string;
  title?: string;
  user_content?: string;
  assistant_content?: string;
}
