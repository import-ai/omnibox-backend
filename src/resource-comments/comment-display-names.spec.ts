import { ResourceCommentThreadResponseDto } from './dto/resource-comment-response.dto';
import {
  ResourceCommentThread,
  ResourceCommentThreadType,
} from './entities/resource-comment-thread.entity';

const thread = Object.assign(new ResourceCommentThread(), {
  id: 'thread',
  type: ResourceCommentThreadType.DOCUMENT,
  namespaceId: 'space',
  resourceId: 'resource',
  creatorId: 'u1',
  creator: { username: 'new-global-name' },
  quotedText: '',
  resolvedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  comments: [
    {
      id: 'comment',
      authorId: 'u1',
      author: { username: 'new-global-name' },
      content: 'Hello [@ id="u2" label="Old"]',
      createdAt: new Date(),
      updatedAt: new Date(),
      attachments: [],
    },
  ],
});

describe('comment display name responses', () => {
  it('uses namespace identities for authors and preserves canonical comment content', () => {
    const dto = ResourceCommentThreadResponseDto.fromEntity(thread, {
      u1: 'Frozen',
      u2: 'Mention',
      unrelated: 'Secret',
    });
    expect(dto.creator.display_name).toBe('Frozen');
    expect(dto.comments[0].author.display_name).toBe('Frozen');
    expect(dto.comments[0].content).toBe(thread.comments[0].content);
    expect(dto.mention_display_names).toEqual({ u2: 'Mention' });
  });

  it('never substitutes a current global username for an unknown historical identity', () => {
    const dto = ResourceCommentThreadResponseDto.fromEntity(thread, {});
    expect(dto.creator.display_name).toBeNull();
    expect(dto.creator.username).toBeNull();
    expect(dto.creator.id).toBe('u1');
  });
});
