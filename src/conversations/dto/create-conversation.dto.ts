import { Expose } from 'class-transformer';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateConversationDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.title.isString'),
  })
  @IsOptional()
  title?: string;

  @IsUUID()
  @IsOptional()
  @Expose({ name: 'recommended_question_id' })
  recommendedQuestionId?: string;
}
