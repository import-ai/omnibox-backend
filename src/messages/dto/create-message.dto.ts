import { IsOptional, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { MessageStatus } from 'omniboxd/messages/entities/message.entity';

export class CreateMessageDto {
  message: Record<string, any>;

  @IsOptional()
  @IsString({
    message: i18nValidationMessage('validation.errors.parentId.isString'),
  })
  parentId?: string;

  @IsOptional()
  status?: MessageStatus;

  @IsOptional()
  attrs?: Record<string, any>;
}
