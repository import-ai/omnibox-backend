import { createHash } from 'node:crypto';

import { AppException } from 'omniboxd/common/exceptions/app.exception';
import {
  ResourceCommentAnchorStatus,
  ResourceCommentThread,
} from 'omniboxd/resource-comments/entities/resource-comment-thread.entity';

import { ResourceCommentsService } from './resource-comments.service';

describe('ResourceCommentsService', () => {
  const createService = () =>
    new ResourceCommentsService(
      {} as any,
      {} as any,
      {} as any,
      { t: (key: string) => key } as any,
    );

  it('hashes the canonical markdown content', () => {
    const service = createService();
    const content = '# Document\n\nContent';

    expect(service.contentHash(content)).toBe(
      createHash('sha256').update(content).digest('hex'),
    );
  });

  it('updates submitted anchors and only explicitly orphans anchors', async () => {
    const service = createService();
    const active = {
      id: '4f7d71ab-f920-4f68-8c5f-247476d4a94f',
      anchorStatus: ResourceCommentAnchorStatus.ACTIVE,
    } as ResourceCommentThread;
    const missing = {
      id: 'b366ba38-052e-47bc-a2c4-70d156eb5c9d',
      anchorStatus: ResourceCommentAnchorStatus.ACTIVE,
    } as ResourceCommentThread;
    const repository = {
      find: jest.fn().mockResolvedValue([active, missing]),
      save: jest.fn().mockResolvedValue([active, missing]),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as any;

    await service.syncAnchors(
      manager,
      'namespace',
      'resource',
      'updated markdown',
      [
        {
          threadId: active.id,
          from: 4,
          to: 12,
          quotedText: 'selected',
          prefix: 'pre',
          suffix: 'post',
        },
      ],
      [missing.id],
    );

    expect(active).toMatchObject({
      anchorFrom: 4,
      anchorTo: 12,
      quotedText: 'selected',
      anchorPrefix: 'pre',
      anchorSuffix: 'post',
      anchorStatus: ResourceCommentAnchorStatus.ACTIVE,
      contentHash: service.contentHash('updated markdown'),
    });
    expect(missing.anchorStatus).toBe(ResourceCommentAnchorStatus.ORPHANED);
    expect(repository.save).toHaveBeenCalledWith([active, missing]);
  });

  it('rejects duplicate anchors for one thread', async () => {
    const service = createService();
    const thread = {
      id: '4f7d71ab-f920-4f68-8c5f-247476d4a94f',
    } as ResourceCommentThread;
    const manager = {
      getRepository: jest.fn().mockReturnValue({
        find: jest.fn().mockResolvedValue([thread]),
        save: jest.fn(),
      }),
    } as any;
    const anchor = {
      threadId: thread.id,
      from: 1,
      to: 2,
      quotedText: 'a',
    };

    await expect(
      service.syncAnchors(
        manager,
        'namespace',
        'resource',
        'a',
        [anchor, anchor],
        [],
      ),
    ).rejects.toBeInstanceOf(AppException);
  });
});
