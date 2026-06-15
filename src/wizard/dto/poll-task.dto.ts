import { Expose } from 'class-transformer';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { InternalTaskDto } from 'omniboxd/tasks/dto/task.dto';

export class PollTaskRequestDto {
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @IsString({
    each: true,
    message: i18nValidationMessage('validation.errors.isString'),
  })
  functions: string[];

  @Expose({ name: 'worker_id' })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  workerId: string;
}

export class PollTaskResponseDto {
  task: InternalTaskDto | null;
}
