import { ResourceComment } from '../entities/resource-comment.entity';
import { ResourceCommentAttachment } from '../entities/resource-comment-attachment.entity';
import {
  ResourceCommentAnchorStatus,
  ResourceCommentThread,
  ResourceCommentThreadType,
} from '../entities/resource-comment-thread.entity';
import { referencedMentionNames } from '../mention-labels';

export class ResourceCommentAuthorResponseDto {
  id: string | null;
  username: string | null;
  display_name?: string | null;
}

export class ResourceCommentAttachmentResponseDto {
  id: string;
  url: string;
  name: string;
  mimetype: string;
  size: number;

  static fromEntity(
    namespaceId: string,
    resourceId: string,
    attachment: ResourceCommentAttachment,
  ): ResourceCommentAttachmentResponseDto {
    return {
      id: attachment.id,
      url: `/api/v1/namespaces/${namespaceId}/resources/${resourceId}/comment-attachments/${attachment.id}`,
      name: attachment.name,
      mimetype: attachment.mimetype,
      size: attachment.size,
    };
  }
}

export class ResourceCommentResponseDto {
  id: string;
  content: string;
  author: ResourceCommentAuthorResponseDto;
  attachments: ResourceCommentAttachmentResponseDto[];
  created_at: string;
  updated_at: string;

  static fromEntity(
    comment: ResourceComment,
    namespaceId: string,
    resourceId: string,
    names?: Record<string, string>,
  ): ResourceCommentResponseDto {
    return {
      id: comment.id,
      content: comment.content,
      author: {
        id: comment.authorId,
        username:
          names === undefined
            ? (comment.author?.username ?? null)
            : (names[comment.authorId ?? ''] ?? null),
        display_name: names?.[comment.authorId ?? ''] ?? null,
      },
      attachments: (comment.attachments ?? []).map((attachment) =>
        ResourceCommentAttachmentResponseDto.fromEntity(
          namespaceId,
          resourceId,
          attachment,
        ),
      ),
      created_at: comment.createdAt.toISOString(),
      updated_at: comment.updatedAt.toISOString(),
    };
  }
}

export class ResourceCommentThreadResponseDto {
  id: string;
  type: ResourceCommentThreadType;
  quoted_text: string;
  anchor: {
    from: number;
    to: number;
    prefix: string;
    suffix: string;
    content_hash: string;
    status: ResourceCommentAnchorStatus;
  } | null;
  resolved: boolean;
  creator: ResourceCommentAuthorResponseDto;
  comments: ResourceCommentResponseDto[];
  mention_display_names?: Record<string, string>;
  created_at: string;
  updated_at: string;

  static fromEntity(
    thread: ResourceCommentThread,
    names?: Record<string, string>,
  ): ResourceCommentThreadResponseDto {
    return {
      id: thread.id,
      type: thread.type ?? ResourceCommentThreadType.INLINE,
      quoted_text: thread.quotedText,
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
        username:
          names === undefined
            ? (thread.creator?.username ?? null)
            : (names[thread.creatorId ?? ''] ?? null),
        display_name: names?.[thread.creatorId ?? ''] ?? null,
      },
      comments: (thread.comments ?? []).map((comment) =>
        ResourceCommentResponseDto.fromEntity(
          comment,
          thread.namespaceId,
          thread.resourceId,
          names,
        ),
      ),
      mention_display_names: referencedMentionNames(
        (thread.comments ?? []).map((comment) => comment.content).join('\n'),
        names ?? {},
      ),
      created_at: thread.createdAt.toISOString(),
      updated_at: thread.updatedAt.toISOString(),
    };
  }
}

export class CreateResourceCommentThreadResponseDto {
  thread: ResourceCommentThreadResponseDto;
  thread_created: boolean;
  comment_created: true;
}

export class ResourceCommentAttachmentUploadResponseDto {
  id: string;
  url: string;
  name: string;
  mimetype: string;
  size: number;
}

export class ListResourceCommentThreadsResponseDto {
  items: ResourceCommentThreadResponseDto[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}
