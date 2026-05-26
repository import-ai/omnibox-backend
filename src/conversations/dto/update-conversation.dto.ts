import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

import { ConversationPreferencesDto } from './conversation-preferences.dto';

export class UpdateConversationDto {
  @IsOptional()
  @IsString({
    message: i18nValidationMessage('validation.errors.title.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.title.isNotEmpty'),
  })
  title?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConversationPreferencesDto)
  preferences?: ConversationPreferencesDto | null;
}
