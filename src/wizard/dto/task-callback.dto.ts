import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { TaskStatus } from 'omniboxd/tasks/tasks.entity';

/**
 * DTO for creating next tasks in a task chain.
 * Used by wizard workers to specify follow-up tasks.
 */
export class NextTaskRequestDto {
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  function: string;

  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  input: Record<string, any>;

  @IsOptional()
  payload?: Record<string, any>;

  @IsOptional()
  priority?: number;
}

export class TaskCallbackDto {
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  id: string;

  @IsOptional()
  exception?: Record<string, any>;

  @IsOptional()
  output?: Record<string, any>;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}
