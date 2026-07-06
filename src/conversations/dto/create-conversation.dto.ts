import { Expose } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateConversationDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.title.isString'),
  })
  @IsOptional()
  title?: string;

  @IsBoolean({
    message: i18nValidationMessage('validation.errors.isBoolean'),
  })
  @IsOptional()
  @Expose({ name: 'is_recommended' })
  isRecommended?: boolean;
}
