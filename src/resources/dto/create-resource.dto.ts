import {
  IsEnum,
  IsArray,
  IsNumber,
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

  @IsNumber()
  @IsNotEmpty()
  namespace: number;

  @IsEnum(ResourceType)
  resourceType: string;

  @IsEnum(SpaceType)
  spaceType: string;

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
