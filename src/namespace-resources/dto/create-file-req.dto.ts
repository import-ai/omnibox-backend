import { Expose } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class CreateFileReqDto {
  @Expose()
  @IsString({
    message: i18nValidationMessage('validation.errors.name.isString'),
  })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.name.isNotEmpty'),
  })
  name: string;

  @Expose()
  @IsString({
    message: i18nValidationMessage('validation.errors.mimetype.isString'),
  })
  @IsOptional()
  mimetype?: string;

  @Expose()
  @IsNumber(
    {},
    {
      message: i18nValidationMessage(
        'validation.errors.maxRunningTasks.isNumber',
      ),
    },
  )
  @Min(1, { message: i18nValidationMessage('validation.errors.min') })
  size: number;
}
