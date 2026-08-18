import { ApiProperty } from '@nestjs/swagger';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

import { DocType } from '../doc-type.enum';

export class IndexedResourceDto {
  @ApiProperty({ enum: [DocType.RESOURCE] })
  type: DocType.RESOURCE;

  @ApiProperty({ description: 'Search index record ID' })
  id: string;

  @ApiProperty({ description: 'Resource ID' })
  resourceId: string;

  @ApiProperty({ description: 'Resource title' })
  title: string;

  @ApiProperty({ description: 'Matched content snippet' })
  content: string;

  @ApiProperty({
    description: 'Resource attributes',
    type: 'object',
    additionalProperties: true,
  })
  attrs: Record<string, any>;

  @ApiProperty({ enum: ResourceType })
  resourceType: ResourceType;
}

export class IndexedMessageDto {
  type: DocType.MESSAGE;
  id: string;
  conversationId: string;
  content: string;
}

export type IndexedDocDto = IndexedResourceDto | IndexedMessageDto;
