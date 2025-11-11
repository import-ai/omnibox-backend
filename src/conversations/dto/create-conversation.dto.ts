import { IsString, IsOptional } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateConversationDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.title.isString'),
  })
  @IsOptional()
  title?: string;
}
