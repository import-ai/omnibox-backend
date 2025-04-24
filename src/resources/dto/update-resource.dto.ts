import {
  IsEnum,
  IsArray,
  IsObject,
  IsString,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';
import { ResourceType, SpaceType } from 'src/resources/resources.entity';

export class UpdateResourceDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  name?: string;

  @IsString()
  @IsNotEmpty()
  namespace: string;

  @IsEnum(ResourceType)
  @IsOptional()
  resourceType?: ResourceType;

  @IsEnum(SpaceType)
  @IsOptional()
  spaceType?: SpaceType;

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
