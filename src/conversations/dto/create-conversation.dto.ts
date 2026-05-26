import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

import { ConversationPreferencesDto } from './conversation-preferences.dto';

export class CreateConversationDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.title.isString'),
  })
  @IsOptional()
  title?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConversationPreferencesDto)
  preferences?: ConversationPreferencesDto;
}
