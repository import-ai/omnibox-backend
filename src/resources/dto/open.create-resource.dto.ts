import {
  IsArray,
  IsString,
  IsObject,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';

export class OpenCreateResourceDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  tagIds?: string[];

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsObject()
  @IsOptional()
  attrs?: Record<string, any>;
}
