import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { TaskStatus } from 'omniboxd/tasks/tasks.entity';

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
