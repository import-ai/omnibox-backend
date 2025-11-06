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
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.mimetype.isNotEmpty'),
  })
  mimetype: string;

  @Expose()
  @IsNumber()
  @Min(1)
  @IsOptional()
  size?: number;
}
