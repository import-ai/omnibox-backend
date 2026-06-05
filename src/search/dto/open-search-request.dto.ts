import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OpenSearchRequestDto {
  @ApiProperty({ description: 'Search query text' })
  @IsString({ message: i18nValidationMessage('validation.errors.isString') })
  @IsNotEmpty({
    message: i18nValidationMessage('validation.errors.isNotEmpty'),
  })
  query: string;

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
