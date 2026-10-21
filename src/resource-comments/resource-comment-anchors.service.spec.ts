import { createHash } from 'node:crypto';

import { AppException } from 'omniboxd/common/exceptions/app.exception';
import {
  ResourceCommentAnchorStatus,
  ResourceCommentThread,
} from 'omniboxd/resource-comments/entities/resource-comment-thread.entity';

import { ResourceCommentAnchorsService } from './resource-comment-anchors.service';

describe('ResourceCommentAnchorsService', () => {
  const createService = () =>
    new ResourceCommentAnchorsService({ t: (key: string) => key } as any);

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

  it('allows different threads to share an anchor', async () => {
    const service = createService();
    const first = {
      id: '4f7d71ab-f920-4f68-8c5f-247476d4a94f',
      anchorStatus: ResourceCommentAnchorStatus.ACTIVE,
    } as ResourceCommentThread;
    const second = {
      id: 'b366ba38-052e-47bc-a2c4-70d156eb5c9d',
      anchorStatus: ResourceCommentAnchorStatus.ACTIVE,
    } as ResourceCommentThread;
    const repository = {
      find: jest.fn().mockResolvedValue([first, second]),
      save: jest.fn().mockResolvedValue([first, second]),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue(repository),
    } as any;

    await expect(
      service.syncAnchors(
        manager,
        'namespace',
        'resource',
        'a',
        [
          { threadId: first.id, from: 1, to: 2, quotedText: 'a' },
          { threadId: second.id, from: 1, to: 2, quotedText: 'a' },
        ],
        [],
      ),
    ).resolves.toBeUndefined();
  });
});

describe('document comments are excluded from anchor mutations', () => {
  const service = new ResourceCommentAnchorsService({
    t: (key: string) => key,
  } as any);

  it.each(['anchor', 'orphan'])(
    'rejects a document id submitted as an %s',
    async (operation) => {
      const document = { id: 'document', type: 'document', anchorStatus: null };
      const save = jest.fn();
      const manager = {
        getRepository: () => ({
          find: () => Promise.resolve([document]),
          save,
        }),
      } as any;
      await expect(
        service.syncAnchors(
          manager,
          'namespace',
          'resource',
          'body',
          operation === 'anchor'
            ? [{ threadId: 'document', from: 0, to: 1, quotedText: 'b' }]
            : [],
          operation === 'orphan' ? ['document'] : [],
        ),
      ).rejects.toMatchObject({ code: 'INVALID_COMMENT_ANCHOR' });
      expect(document.anchorStatus).toBeNull();
      expect(save).not.toHaveBeenCalled();
    },
  );

  it('limits mass orphaning used by history restore to inline threads', async () => {
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    await service.orphanAnchors(
      { getRepository: () => ({ update }) } as any,
      'namespace',
      'resource',
    );
    expect(update).toHaveBeenCalledWith(
      {
        namespaceId: 'namespace',
        resourceId: 'resource',
        type: 'inline',
        anchorStatus: 'active',
      },
      { anchorStatus: 'orphaned' },
    );
  });
});
