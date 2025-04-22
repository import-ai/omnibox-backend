import {
  IsEnum,
  IsNumber,
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

  @IsNumber()
  @IsNotEmpty()
  namespace: number;

  @IsEnum(ResourceType)
  @IsOptional()
  resourceType?: ResourceType;

  @IsEnum(SpaceType)
  @IsOptional()
  spaceType?: SpaceType;

  @IsNumber()
  @IsOptional()
  @IsNotEmpty()
  parentId?: number;

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
