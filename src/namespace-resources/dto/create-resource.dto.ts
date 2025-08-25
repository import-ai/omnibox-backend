import {
  IsEnum,
  IsArray,
  IsString,
  IsObject,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';
import { ResourceType } from 'omniboxd/namespace-resources/namespace-resources.entity';

export class CreateResourceDto {
  @IsString()
  @IsOptional()
  name: string;

  @IsString()
  @IsNotEmpty()
  namespaceId: string;

  @IsEnum(ResourceType)
  resourceType: ResourceType;

  @IsString()
  @IsNotEmpty()
  parentId: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  tag_ids?: string[];

  @IsString()
  @IsOptional()
  content?: string;

  @IsObject()
  @IsOptional()
  attrs?: Record<string, any>;
}
