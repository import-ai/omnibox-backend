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

  // Same flag as ResourceDto/ResourceSummaryDto. A search hit is a first-class
  // way to reach a resource — the move-to and resource pickers offer their hits
  // as destinations — so it has to carry the same gate as a folder listing.
  @ApiProperty({
    description:
      'True for resources the product writes and the user may only read',
  })
  readOnly: boolean;
}

export class IndexedMessageDto {
  type: DocType.MESSAGE;
  id: string;
  messageId: string;
  conversationId: string;
  title: string;
  role: 'user' | 'assistant';
  content: string;
}

export type IndexedDocDto = IndexedResourceDto | IndexedMessageDto;
