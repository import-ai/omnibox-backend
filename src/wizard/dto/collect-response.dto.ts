import { IsNotEmpty, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CollectResponseDto {
  @IsString({
    message: i18nValidationMessage('validation.errors.task_id.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.task_id.isNotEmpty'),
  })
  task_id: string;

  @IsString({
    message: i18nValidationMessage('validation.errors.resource_id.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.resource_id.isNotEmpty'),
  })
  resource_id: string;
}
