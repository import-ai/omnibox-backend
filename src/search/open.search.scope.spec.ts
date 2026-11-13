import { OpenResourcesService } from 'omniboxd/namespace-resources/open-resources.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { IndexRecordType } from 'omniboxd/wizard/dto/index-record.dto';

import { OpenSearchService } from './open.search.service';

const nodes = [
  { id: 'personal', parentId: null },
  { id: 'team', parentId: null },
  { id: 'mine', parentId: 'personal' },
  { id: 'shared', parentId: 'team' },
  { id: 'another-private', parentId: null },
  { id: 'other', parentId: 'another-private' },
];

describe('Open search combined scope', () => {
  const resources = {
    batchGetParentResources: jest.fn(),
    batchGetResourceMeta: jest.fn(),
  };
  const permissions = { getCurrentPermissions: jest.fn() };
  const wizard = { search: jest.fn() };
  const openResources = new OpenResourcesService(
    {} as never,
    resources as never,
    permissions as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const service = new OpenSearchService(
    wizard as never,
    openResources,
    resources as never,
  );
  beforeEach(() => {
    resources.batchGetParentResources.mockResolvedValue(
      new Map(nodes.map((n) => [n.id, n])),
    );
    permissions.getCurrentPermissions.mockResolvedValue(
      new Map(nodes.map((n) => [n.id, ResourcePermission.CAN_VIEW])),
    );
    resources.batchGetResourceMeta.mockResolvedValue(
      new Map(
        nodes.map((n) => [n.id, { attrs: {}, resourceType: ResourceType.DOC }]),
      ),
    );
    wizard.search.mockResolvedValue({
      records: ['mine', 'shared', 'other', 'shared'].map((id, index) => ({
        id: 'chunk-' + index,
        type: IndexRecordType.CHUNK,
        chunk: { resourceId: id, text: id, title: id },
      })),
    });
  });
  const key = {
    userId: 'owner',
    namespaceId: 'ns',
    attrs: { root_resource_id: 'personal' },
    resourceScope: {
      rootIds: ['personal', 'team'],
      defaultResourceId: 'personal',
    },
  };
  it('returns Personal and Team hits with one key, excluding another member private hits', async () => {
    const hits = await service.search(key as never, 'query');
    expect(hits.map((hit) => hit.resourceId)).toEqual(['mine', 'shared']);
    expect(wizard.search).toHaveBeenCalledWith(
      expect.objectContaining({ namespaceId: 'ns', userId: 'owner' }),
    );
  });
  it('rechecks current resource permission when filtering search results', async () => {
    permissions.getCurrentPermissions.mockResolvedValue(
      new Map([['mine', ResourcePermission.CAN_VIEW]]),
    );
    expect(
      (await service.search(key as never, 'query')).map(
        (hit) => hit.resourceId,
      ),
    ).toEqual(['mine']);
  });
  it('keeps legacy Personal keys limited to their original tree', async () => {
    expect(
      (
        await service.search(
          { ...key, resourceScope: undefined } as never,
          'query',
        )
      ).map((hit) => hit.resourceId),
    ).toEqual(['mine']);
  });
  it('returns a short page as a plain array without a pending error', async () => {
    wizard.search.mockResolvedValue({
      records: [
        {
          id: 'chunk-0',
          type: IndexRecordType.CHUNK,
          chunk: { resourceId: 'mine', text: 'mine', title: 'mine' },
        },
      ],
      hasMore: true,
    });
    expect(
      (await service.search(key as never, 'query', { limit: 100 })).map(
        (hit) => hit.resourceId,
      ),
    ).toEqual(['mine']);
  });
  it('returns an empty array when nothing matches', async () => {
    wizard.search.mockResolvedValue({ records: [] });
    await expect(service.search(key as never, 'query')).resolves.toEqual([]);
  });
});
