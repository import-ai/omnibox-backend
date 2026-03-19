import { IsArray, IsString, IsOptional } from 'class-validator';
import { Expose } from 'class-transformer';

export class FilterResourcesRequestDto {
  @Expose({ name: 'ids' })
  @IsArray()
  @IsOptional()
  @IsString({
    each: true,
  })
  ids?: string[];

  @Expose({ name: 'created_at_before' })
  @IsOptional()
  createdAtBefore?: Date;

  @Expose({ name: 'created_at_after' })
  @IsOptional()
  createdAtAfter?: Date;

  @Expose({ name: 'user_id' })
  @IsString()
  @IsOptional()
  userId?: string;

  @Expose({ name: 'parent_id' })
  @IsString()
  @IsOptional()
  parentId?: string;

  @Expose({ name: 'tags' })
  @IsArray()
  @IsOptional()
  @IsString({
    each: true,
  })
  tags?: string[];

  @Expose({ name: 'name_contains' })
  @IsString()
  @IsOptional()
  nameContains?: string;

  @Expose({ name: 'content_contains' })
  @IsString()
  @IsOptional()
  contentContains?: string;
}
