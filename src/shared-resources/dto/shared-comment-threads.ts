import type { ResourceCommentThreadResponseDto } from 'omniboxd/resource-comments/dto/resource-comment-response.dto';

export function toSharedCommentThreads(
  threads: ResourceCommentThreadResponseDto[],
  shareId: string,
  resourceId: string,
): ResourceCommentThreadResponseDto[] {
  return threads.map((thread) => ({
    ...thread,
    comments: thread.comments.map((comment) => ({
      ...comment,
      attachments: comment.attachments.map((attachment) => ({
        ...attachment,
        url: `/api/v1/shares/${shareId}/resources/${resourceId}/comment-attachments/${attachment.id}`,
      })),
    })),
  }));
}
