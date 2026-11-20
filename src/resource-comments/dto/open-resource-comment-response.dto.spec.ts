import { ResourceComment } from '../entities/resource-comment.entity';
import { ResourceCommentAttachment } from '../entities/resource-comment-attachment.entity';
import {
  ResourceCommentThread,
  ResourceCommentThreadType,
} from '../entities/resource-comment-thread.entity';
import {
  OpenResourceCommentResponseDto,
  OpenResourceCommentThreadResponseDto,
} from './open-resource-comment-response.dto';

describe('Open comment response whitelist', () => {
  const now = new Date('2026-11-20T00:00:00Z');
  it('keeps image-only comments and only exposes attachment metadata', () => {
    const entity = Object.assign(new ResourceComment(), {
      id: 'comment',
      content: '',
      authorId: 'author',
      createdAt: now,
      updatedAt: now,
      attachments: [
        Object.assign(new ResourceCommentAttachment(), {
          id: 'attachment',
          name: 'image.png',
          mimetype: 'image/png',
          size: 3,
          objectKey: 'private',
          storageUserId: 'secret',
          uploaderId: 'secret',
        }),
      ],
    });
    expect(
      OpenResourceCommentResponseDto.fromEntity(entity, { author: 'Snapshot' }),
    ).toEqual({
      id: 'comment',
      content: '',
      author: { id: 'author', display_name: 'Snapshot' },
      attachments: [
        { id: 'attachment', name: 'image.png', mimetype: 'image/png', size: 3 },
      ],
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  });
  it('uses a nullable identity object and document anchor', () => {
    const thread = Object.assign(new ResourceCommentThread(), {
      id: 'thread',
      type: ResourceCommentThreadType.DOCUMENT,
      creatorId: null,
      quotedText: '',
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    expect(
      OpenResourceCommentThreadResponseDto.fromEntity(thread, [], 0, {}),
    ).toMatchObject({
      creator: { id: null, display_name: null },
      anchor: null,
      quoted_text: '',
      comments: [],
      comments_pagination: { total: 0, offset: 0, limit: 1, has_more: false },
    });
  });
});
