import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { Expose } from 'class-transformer';
import { IsOptional } from 'class-validator';

export class VFSResourceFilterOptionsDto {
  @Expose({ name: 'created_at_before' })
  @IsOptional()
  createdAtBefore?: Date;

  @Expose({ name: 'created_at_after' })
  @IsOptional()
  createdAtAfter?: Date;

  @Expose({ name: 'updated_at_before' })
  @IsOptional()
  updatedAtBefore?: Date;

  @Expose({ name: 'updated_at_after' })
  @IsOptional()
  updatedAtAfter?: Date;

  @IsOptional()
  tags?: string[];

  @Expose({ name: 'name_pattern' })
  @IsOptional()
  namePattern?: string;

  @Expose({ name: 'content_pattern' })
  @IsOptional()
  contentPattern?: string;

  @Expose({ name: 'url_pattern' })
  @IsOptional()
  urlPattern?: string;

  @Expose({ name: 'user_id' })
  @IsOptional()
  userId?: string;

  @Expose({ name: 'parent_id' })
  @IsOptional()
  parentId?: string;

  @Expose({ name: 'resource_type' })
  @IsOptional()
  resourceTypes?: ResourceType[];

  @IsOptional()
  offset?: number;

  @IsOptional()
  limit?: number;
}

export class VFSFilterResourcesRequestDto {
  path: string;

  @Expose({ name: 'user_id' })
  userId: string;

  options: VFSResourceFilterOptionsDto;
}
