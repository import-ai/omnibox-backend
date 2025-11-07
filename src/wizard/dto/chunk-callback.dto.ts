import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class ChunkCallbackDto {
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  id: string;

  @IsNumber(
    {},
    { message: i18nValidationMessage('validation.errors.isNumber') },
  )
  @Min(0, { message: i18nValidationMessage('validation.errors.min') })
  chunk_index: number;

  @IsNumber(
    {},
    { message: i18nValidationMessage('validation.errors.isNumber') },
  )
  @Min(1, { message: i18nValidationMessage('validation.errors.min') })
  total_chunks: number;

  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  data: string;

  @IsBoolean({ message: i18nValidationMessage('validation.errors.isBoolean') })
  is_final_chunk: boolean;
}
