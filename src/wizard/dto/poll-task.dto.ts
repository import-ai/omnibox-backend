import { IsArray, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { InternalTaskDto } from 'omniboxd/tasks/dto/task.dto';

export class PollTaskRequestDto {
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @IsString({
    each: true,
    message: i18nValidationMessage('validation.errors.isString'),
  })
  functions: string[];
}

export class PollTaskResponseDto {
  task: InternalTaskDto | null;
}
