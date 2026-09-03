import { ResourceComment } from '../entities/resource-comment.entity';
import {
  ResourceCommentAnchorStatus,
  ResourceCommentThread,
} from '../entities/resource-comment-thread.entity';

export class ResourceCommentAuthorResponseDto {
  id: string | null;
  username: string | null;
}

export class ResourceCommentResponseDto {
  id: string;
  content: string;
  author: ResourceCommentAuthorResponseDto;
  created_at: string;
  updated_at: string;

  static fromEntity(comment: ResourceComment): ResourceCommentResponseDto {
    return {
      id: comment.id,
      content: comment.content,
      author: {
        id: comment.authorId,
        username: comment.author?.username ?? null,
      },
      created_at: comment.createdAt.toISOString(),
      updated_at: comment.updatedAt.toISOString(),
    };
  }
}

export class ResourceCommentThreadResponseDto {
  id: string;
  quoted_text: string;
  anchor: {
    from: number;
    to: number;
    prefix: string;
    suffix: string;
    content_hash: string;
    status: ResourceCommentAnchorStatus;
  };
  resolved: boolean;
  creator: ResourceCommentAuthorResponseDto;
  comments: ResourceCommentResponseDto[];
  created_at: string;
  updated_at: string;

  static fromEntity(
    thread: ResourceCommentThread,
  ): ResourceCommentThreadResponseDto {
    return {
      id: thread.id,
      quoted_text: thread.quotedText,
      anchor: {
        from: thread.anchorFrom,
        to: thread.anchorTo,
        prefix: thread.anchorPrefix,
        suffix: thread.anchorSuffix,
        content_hash: thread.contentHash,
        status: thread.anchorStatus,
      },
      resolved: thread.resolvedAt !== null,
      creator: {
        id: thread.creatorId,
        username: thread.creator?.username ?? null,
      },
      comments: (thread.comments ?? []).map((comment) =>
        ResourceCommentResponseDto.fromEntity(comment),
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

export class ListResourceCommentThreadsResponseDto {
  items: ResourceCommentThreadResponseDto[];
  total: number;
  offlet: number;
  limits: number;
  has_more: boolean;
}
