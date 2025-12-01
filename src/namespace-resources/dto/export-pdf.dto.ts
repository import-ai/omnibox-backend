import { IsString, IsOptional, IsEnum, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class MarginDto {
  @IsOptional()
  @IsString()
  top?: string;

  @IsOptional()
  @IsString()
  right?: string;

  @IsOptional()
  @IsString()
  bottom?: string;

  @IsOptional()
  @IsString()
  left?: string;
}

export class ExportPdfDto {
  @IsString()
  markdown: string;

  @IsOptional()
  @IsString()
  filename?: string;

  @IsOptional()
  @IsEnum(['A4', 'Letter', 'Legal', 'A3', 'A5', 'A6'])
  format?: 'A4' | 'Letter' | 'Legal' | 'A3' | 'A5' | 'A6';

  @IsOptional()
  @IsBoolean()
  landscape?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => MarginDto)
  margin?: MarginDto;
}