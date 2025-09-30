import { Expose } from 'class-transformer';
import {
  IsEnum,
  IsArray,
  IsString,
  IsObject,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

export class CreateResourceDto {
  @Expose()
  @IsEnum(ResourceType)
  resourceType: ResourceType;

  @Expose()
  @IsString()
  @IsNotEmpty()
  parentId: string;

  @Expose()
  @IsString()
  @IsOptional()
  name?: string;

  @Expose({ name: 'tag_ids' })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  tagIds?: string[];

  @Expose()
  @IsString()
  @IsOptional()
  content?: string;

  @Expose()
  @IsObject()
  @IsOptional()
  attrs?: Record<string, any>;
}
