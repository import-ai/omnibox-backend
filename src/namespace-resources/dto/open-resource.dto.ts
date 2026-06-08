import { ApiProperty } from '@nestjs/swagger';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { TagDto } from 'omniboxd/tag/dto/tag.dto';

import { BreadcrumbItemDto } from './breadcrumb-item.dto';
import { ResourceDto, SpaceType } from './resource.dto';

export class OpenResourceContentPaginationDto {
  @ApiProperty({ description: '0-based line offset of returned content.' })
  offset: number;

  @ApiProperty({ description: 'Requested maximum number of content lines.' })
  limit: number;

  @ApiProperty({
    description: 'Total line count of the full resource content.',
  })
  total_lines: number;
}

export class OpenResourceDto {
  id: string;
  namespace_id: string;
  parent_id: string | null;
  name: string;
  resource_type: ResourceType;
  content: string;

  @ApiProperty({
    description: 'Pagination metadata for the resource content.',
    type: () => OpenResourceContentPaginationDto,
  })
  content_pagination: OpenResourceContentPaginationDto;

  tags: TagDto[];
  attrs: Record<string, any>;
  global_permission: ResourcePermission | null;
  current_permission: ResourcePermission;
  path: BreadcrumbItemDto[];
  space_type: SpaceType;
  created_at: string;
  updated_at: string;

  static fromResourceDto(
    resource: ResourceDto,
    contentPagination: { offset: number; limit: number },
  ) {
    const dto = new OpenResourceDto();
    const { text, totalLines } = paginateResourceContent(
      resource.content ?? '',
      contentPagination.offset,
      contentPagination.limit,
    );

    dto.id = resource.id;
    dto.namespace_id = resource.namespace_id;
    dto.parent_id = resource.parent_id;
    dto.name = resource.name;
    dto.resource_type = resource.resource_type;
    dto.content = text;
    dto.content_pagination = {
      offset: contentPagination.offset,
      limit: contentPagination.limit,
      total_lines: totalLines,
    };
    dto.tags = resource.tags;
    dto.attrs = resource.attrs;
    dto.global_permission = resource.global_permission;
    dto.current_permission = resource.current_permission;
    dto.path = resource.path;
    dto.space_type = resource.space_type;
    dto.created_at = resource.created_at;
    dto.updated_at = resource.updated_at;
    return dto;
  }
}

function paginateResourceContent(
  content: string,
  offset: number,
  limit: number,
): { text: string; totalLines: number } {
  const lines = content.trim().length > 0 ? content.trim().split(/\r?\n/) : [];
  return {
    text: lines.slice(offset, offset + limit).join('\n'),
    totalLines: lines.length,
  };
}
