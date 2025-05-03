import {
  IsEnum,
  IsArray,
  IsString,
  IsObject,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';
import { SpaceType, ResourceType } from 'src/resources/resources.entity';

export class CreateResourceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  namespaceId: string;

  @IsEnum(ResourceType)
  resourceType: string;

  @IsEnum(SpaceType)
  spaceType: string;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  parentId?: string;

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
