import {
  IsEnum,
  IsArray,
  IsString,
  IsObject,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';
import { ResourceType } from 'omniboxd/resources/resources.entity';

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
  tags?: string[];

  @IsString()
  @IsOptional()
  content?: string;

  @IsObject()
  @IsOptional()
  attrs?: Record<string, any>;
}
