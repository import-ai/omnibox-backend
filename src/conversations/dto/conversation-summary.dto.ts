import { BaseDto } from 'src/common/base.dto';

export interface ConversationSummaryDto extends BaseDto {
  id: string;
  title?: string;
  snippet?: string;
}
