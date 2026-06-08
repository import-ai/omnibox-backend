import { Transform } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ApiPropertyOptional } from '@nestjs/swagger';

function splitCsv(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      typeof item === 'string'
        ? item.split(',').map((part) => part.trim())
        : [],
    );
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export class OpenListTagsRequestDto {
  @ApiPropertyOptional({ description: 'Tag name substring to search for' })
  @IsOptional()
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  name?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated tag IDs. Alias: id',
    type: String,
  })
  @IsOptional()
  @Transform(({ value }) => splitCsv(value))
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @IsString({
    each: true,
    message: i18nValidationMessage('validation.errors.isString'),
  })
  ids?: string[];

  @ApiPropertyOptional({
    description: 'Comma-separated tag IDs. Alias for ids',
    type: String,
  })
  @IsOptional()
  @Transform(({ value }) => splitCsv(value))
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @IsString({
    each: true,
    message: i18nValidationMessage('validation.errors.isString'),
  })
  id?: string[];

  @ApiPropertyOptional({ description: 'Result offset', minimum: 0 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(0, { message: i18nValidationMessage('validation.errors.min') })
  offset?: number;

  @ApiPropertyOptional({ description: 'Maximum results to return', minimum: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt({ message: i18nValidationMessage('validation.errors.isInt') })
  @Min(1, { message: i18nValidationMessage('validation.errors.min') })
  limit?: number;
}
