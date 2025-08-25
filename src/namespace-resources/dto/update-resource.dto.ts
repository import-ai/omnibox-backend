import {
  IsEnum,
  IsArray,
  IsObject,
  IsString,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';
import { ResourceType } from 'omniboxd/namespace-resources/namespace-resources.entity';

export class UpdateResourceDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  namespaceId: string;

  @IsEnum(ResourceType)
  @IsOptional()
  resourceType?: ResourceType;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  parentId?: string;

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
