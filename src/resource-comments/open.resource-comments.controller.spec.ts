import { APIKey } from 'omniboxd/api-key/api-key.entity';
import { OpenResourcesService } from 'omniboxd/namespace-resources/open-resources.service';

import { OpenListCommentThreadsRequestDto } from './dto/open-resource-comment-request.dto';
import { OpenResourceCommentsController } from './open.resource-comments.controller';
import { ResourceCommentOpenQueriesService } from './resource-comment-open-queries.service';

describe('Open comments controller scope enforcement', () => {
  const apiKey = {
    namespaceId: 'space',
    userId: 'user',
    attrs: { root_resource_id: 'legacy-root' },
    resourceScope: {
      rootIds: ['personal', 'team'],
      defaultResourceId: 'personal',
    },
  } as APIKey;
  it('uses the resolved resource and complete key scope for both endpoints', async () => {
    const resolveResourceId = jest.fn().mockResolvedValue('resolved');
    const listThreads = jest.fn().mockResolvedValue({ items: [] });
    const listComments = jest.fn().mockResolvedValue({ items: [] });
    const controller = new OpenResourceCommentsController(
      { resolveResourceId } as unknown as OpenResourcesService,
      {
        listThreads,
        listComments,
      } as unknown as ResourceCommentOpenQueriesService,
    );
    const query = new OpenListCommentThreadsRequestDto();
    await controller.listThreads(apiKey, 'resource', query);
    await controller.listComments(apiKey, 'resource', 'thread', query);
    expect(resolveResourceId).toHaveBeenNthCalledWith(
      1,
      'space',
      apiKey.resourceScope,
      'resource',
      'user',
    );
    expect(listThreads).toHaveBeenCalledWith(
      'space',
      'resolved',
      'user',
      query,
    );
    expect(listComments).toHaveBeenCalledWith(
      'space',
      'resolved',
      'thread',
      'user',
      query,
    );
  });
  it('falls back to the legacy root and never queries after a rejected scope', async () => {
    const resolveResourceId = jest.fn().mockRejectedValue(new Error('scope'));
    const listThreads = jest.fn();
    const listComments = jest.fn();
    const controller = new OpenResourceCommentsController(
      { resolveResourceId } as unknown as OpenResourcesService,
      {
        listThreads,
        listComments,
      } as unknown as ResourceCommentOpenQueriesService,
    );
    const legacy = { ...apiKey, resourceScope: undefined };
    await expect(
      controller.listThreads(
        legacy,
        'resource',
        new OpenListCommentThreadsRequestDto(),
      ),
    ).rejects.toThrow('scope');
    await expect(
      controller.listComments(
        legacy,
        'resource',
        'thread',
        new OpenListCommentThreadsRequestDto(),
      ),
    ).rejects.toThrow('scope');
    expect(resolveResourceId).toHaveBeenCalledWith(
      'space',
      'legacy-root',
      'resource',
      'user',
    );
    expect(listThreads).not.toHaveBeenCalled();
    expect(listComments).not.toHaveBeenCalled();
  });
});
