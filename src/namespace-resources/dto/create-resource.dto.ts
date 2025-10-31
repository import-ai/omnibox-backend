import {
  IsEnum,
  IsArray,
  IsString,
  IsObject,
  IsOptional,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

export class CreateResourceDto {
  @IsString()
  @IsOptional()
  name: string;

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

  @ValidateIf((o) => o.resourceType === ResourceType.FILE)
  @IsString()
  @IsNotEmpty()
  file_id?: string;
}
