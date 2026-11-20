import { ApiProperty } from '@nestjs/swagger';

import { ResourceComment } from '../entities/resource-comment.entity';
import { ResourceCommentAttachment } from '../entities/resource-comment-attachment.entity';
import {
  ResourceCommentAnchorStatus,
  ResourceCommentThread,
  ResourceCommentThreadType,
} from '../entities/resource-comment-thread.entity';
import { referencedMentionNames } from '../mention-labels';

export class OpenCommentIdentityResponseDto {
  @ApiProperty({ type: String, nullable: true })
  id: string | null;

  @ApiProperty({ type: String, nullable: true })
  display_name: string | null;
}

export class OpenCommentPaginationResponseDto {
  @ApiProperty({ minimum: 0 })
  total: number;
  @ApiProperty({ minimum: 0, default: 0 })
  offset: number;
  @ApiProperty({ minimum: 1, maximum: 100, default: 20 })
  limit: number;
  @ApiProperty()
  has_more: boolean;
}

export class OpenCommentPreviewPaginationResponseDto extends OpenCommentPaginationResponseDto {
  @ApiProperty({ default: 0, enum: [0] })
  offset: number = 0;

  @ApiProperty({ default: 1, enum: [1] })
  limit: number = 1;
}

export class OpenCommentAttachmentResponseDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  mimetype: string;
  @ApiProperty({ minimum: 0 })
  size: number;

  static fromEntity(
    attachment: ResourceCommentAttachment,
  ): OpenCommentAttachmentResponseDto {
    return {
      id: attachment.id,
      name: attachment.name,
      mimetype: attachment.mimetype,
      size: attachment.size,
    };
  }
}

export class OpenResourceCommentResponseDto {
  @ApiProperty()
  id: string;
  @ApiProperty({
    description:
      'Stored text, including mention shortcodes. Image-only comments may have empty content.',
  })
  content: string;
  @ApiProperty({ type: OpenCommentIdentityResponseDto })
  author: OpenCommentIdentityResponseDto;
  @ApiProperty({ type: [OpenCommentAttachmentResponseDto] })
  attachments: OpenCommentAttachmentResponseDto[];
  @ApiProperty({ format: 'date-time' })
  created_at: string;
  @ApiProperty({ format: 'date-time' })
  updated_at: string;

  static fromEntity(
    comment: ResourceComment,
    names: Record<string, string>,
  ): OpenResourceCommentResponseDto {
    return {
      id: comment.id,
      content: comment.content,
      author: {
        id: comment.authorId,
        display_name: names[comment.authorId ?? ''] ?? null,
      },
      attachments: (comment.attachments ?? []).map((attachment) =>
        OpenCommentAttachmentResponseDto.fromEntity(attachment),
      ),
      created_at: comment.createdAt.toISOString(),
      updated_at: comment.updatedAt.toISOString(),
    };
  }
}

export class OpenCommentAnchorResponseDto {
  @ApiProperty()
  from: number;
  @ApiProperty()
  to: number;
  @ApiProperty()
  prefix: string;
  @ApiProperty()
  suffix: string;
  @ApiProperty()
  content_hash: string;
  @ApiProperty({ enum: ResourceCommentAnchorStatus })
  status: ResourceCommentAnchorStatus;
}

export class OpenResourceCommentThreadResponseDto {
  @ApiProperty()
  id: string;
  @ApiProperty({ enum: ResourceCommentThreadType })
  type: ResourceCommentThreadType;
  @ApiProperty()
  quoted_text: string;
  @ApiProperty({ type: OpenCommentAnchorResponseDto, nullable: true })
  anchor: OpenCommentAnchorResponseDto | null;
  @ApiProperty()
  resolved: boolean;
  @ApiProperty({ type: OpenCommentIdentityResponseDto })
  creator: OpenCommentIdentityResponseDto;
  @ApiProperty({
    type: [OpenResourceCommentResponseDto],
    description:
      'The earliest surviving comment, at most one. Read further comments through the comments endpoint.',
  })
  comments: OpenResourceCommentResponseDto[];
  @ApiProperty({ type: OpenCommentPreviewPaginationResponseDto })
  comments_pagination: OpenCommentPreviewPaginationResponseDto;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  mention_display_names: Record<string, string>;
  @ApiProperty({ format: 'date-time' })
  created_at: string;
  @ApiProperty({ format: 'date-time' })
  updated_at: string;

  static fromEntity(
    thread: ResourceCommentThread,
    comments: ResourceComment[],
    total: number,
    names: Record<string, string>,
  ): OpenResourceCommentThreadResponseDto {
    return {
      id: thread.id,
      type: thread.type,
      quoted_text:
        thread.type === ResourceCommentThreadType.DOCUMENT
          ? ''
          : thread.quotedText,
      anchor:
        thread.type === ResourceCommentThreadType.DOCUMENT
          ? null
          : {
              from: thread.anchorFrom!,
              to: thread.anchorTo!,
              prefix: thread.anchorPrefix!,
              suffix: thread.anchorSuffix!,
              content_hash: thread.contentHash!,
              status: thread.anchorStatus!,
            },
      resolved: thread.resolvedAt !== null,
      creator: {
        id: thread.creatorId,
        display_name: names[thread.creatorId ?? ''] ?? null,
      },
      comments: comments.map((comment) =>
        OpenResourceCommentResponseDto.fromEntity(comment, names),
      ),
      comments_pagination: {
        total,
        offset: 0,
        limit: 1,
        has_more: comments.length < total,
      },
      mention_display_names: referencedMentionNames(
        comments.map((comment) => comment.content).join('\n'),
        names,
      ),
      created_at: thread.createdAt.toISOString(),
      updated_at: thread.updatedAt.toISOString(),
    };
  }
}

export class OpenListCommentThreadsResponseDto extends OpenCommentPaginationResponseDto {
  @ApiProperty({ type: [OpenResourceCommentThreadResponseDto] })
  items: OpenResourceCommentThreadResponseDto[];
}

export class OpenListCommentsResponseDto extends OpenCommentPaginationResponseDto {
  @ApiProperty({ type: [OpenResourceCommentResponseDto] })
  items: OpenResourceCommentResponseDto[];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  mention_display_names: Record<string, string>;
}
