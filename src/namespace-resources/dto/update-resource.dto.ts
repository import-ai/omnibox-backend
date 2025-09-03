import {
  IsEnum,
  IsArray,
  IsObject,
  IsString,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';
import { UpdateResourceReqDto } from 'omniboxd/resources/dto/update-resource-req.dto';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

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

  toUpdateReq(): UpdateResourceReqDto {
    const updateReq = new UpdateResourceReqDto();
    updateReq.name = this.name;
    updateReq.parentId = this.parentId;
    updateReq.tagIds = this.tag_ids ? this.tag_ids : undefined;
    updateReq.content = this.content;
    updateReq.attrs = this.attrs;
    return updateReq;
  }
}
