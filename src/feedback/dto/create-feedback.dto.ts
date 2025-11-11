import {
  IsEnum,
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { FeedbackType } from '../entities/feedback.entity';

export class CreateFeedbackDto {
  @IsEnum(FeedbackType, {
    message: i18nValidationMessage('validation.errors.type.isEnum'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.type.isNotEmpty'),
  })
  type: FeedbackType;

  @IsString({
    message: i18nValidationMessage('validation.errors.description.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.description.isNotEmpty'),
  })
  @MaxLength(5000, {
    message: i18nValidationMessage('validation.errors.description.maxLength'),
  })
  description: string;

  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsOptional()
  @MaxLength(500, {
    message: i18nValidationMessage('validation.errors.maxLength'),
  })
  contactInfo?: string;
}
