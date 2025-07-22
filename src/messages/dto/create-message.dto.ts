import { IsOptional, IsString } from 'class-validator';
import { MessageStatus } from 'omnibox-backend/messages/entities/message.entity';

export class CreateMessageDto {
  message: Record<string, any>;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  status?: MessageStatus;

  @IsOptional()
  attrs?: Record<string, any>;
}
