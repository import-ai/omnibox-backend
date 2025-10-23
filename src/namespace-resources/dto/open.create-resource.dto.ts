import {
  IsArray,
  IsString,
  IsObject,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
} from 'class-validator';

export class OpenCreateResourceDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  tag_ids?: string[];

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsObject()
  @IsOptional()
  attrs?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  skip_parsing_tags_from_content?: boolean;
}
