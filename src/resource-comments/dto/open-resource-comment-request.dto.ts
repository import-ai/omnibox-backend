import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export function parseOpenCommentPageNumber(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return NaN;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : NaN;
}

export class OpenCommentPageRequestDto {
  @ApiPropertyOptional({
    type: Number,
    default: 0,
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
  })
  @Transform(({ value }) =>
    value === undefined ? 0 : parseOpenCommentPageNumber(value),
  )
  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(0, { message: i18nValidationMessage('validation.errors.min') })
  @Max(Number.MAX_SAFE_INTEGER, {
    message: i18nValidationMessage('validation.errors.max'),
  })
  offset: number = 0;

  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @Transform(({ value }) =>
    value === undefined ? 20 : parseOpenCommentPageNumber(value),
  )
  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(1, { message: i18nValidationMessage('validation.errors.min') })
  @Max(100, { message: i18nValidationMessage('validation.errors.max') })
  limit: number = 20;
}

export class OpenListCommentThreadsRequestDto extends OpenCommentPageRequestDto {
  @ApiPropertyOptional({ enum: ['all', 'document', 'inline'], default: 'all' })
  @IsIn(['all', 'document', 'inline'], {
    message: i18nValidationMessage('validation.errors.isIn'),
  })
  type: 'all' | 'document' | 'inline' = 'all';

  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'Omit to include both states.',
  })
  @IsOptional()
  @IsIn(['true', 'false'], {
    message: i18nValidationMessage('validation.errors.isIn'),
  })
  resolved?: 'true' | 'false';
}
