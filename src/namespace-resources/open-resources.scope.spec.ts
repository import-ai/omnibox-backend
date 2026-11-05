import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

import { OpenResourcesService } from './open-resources.service';

const scope = { rootIds: ['personal', 'team'], defaultResourceId: 'personal' };
const nodes = [
  { id: 'personal', parentId: null },
  { id: 'team', parentId: null },
  { id: 'mine', parentId: 'personal' },
  { id: 'shared', parentId: 'team' },
  { id: 'other-personal', parentId: null },
  { id: 'other', parentId: 'other-personal' },
];

describe('Open API combined resource scope', () => {
  const resources = {
    batchGetParentResources: jest.fn(),
    getResourceOrFail: jest.fn(),
  };
  const permissions = { getCurrentPermissions: jest.fn() };
  const namespaceResources = {
    create: jest.fn(),
    uploadFile: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getResource: jest.fn(),
    listChildrenWithTotal: jest.fn(),
  };
  const i18n = { t: (key: string) => key };
  const service = new OpenResourcesService(
    namespaceResources as never,
    resources as never,
    permissions as never,
    {} as never,
    {} as never,
    i18n as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    resources.batchGetParentResources.mockResolvedValue(
      new Map(nodes.map((n) => [n.id, n])),
    );
    permissions.getCurrentPermissions.mockResolvedValue(
      new Map(nodes.map((n) => [n.id, ResourcePermission.CAN_EDIT])),
    );
    namespaceResources.getResource.mockResolvedValue({ id: 'shared' });
  });

  it('allows both roots and descendants but never another member private tree', async () => {
    await expect(
      service.filterResourceScope('ns', scope, 'user', [
        'mine',
        'shared',
        'other',
        'missing',
        'shared',
      ]),
    ).resolves.toEqual(['mine', 'shared']);
    await expect(
      service.resolveResourceId('ns', scope, 'other', 'user'),
    ).rejects.toThrow();
  });

  it('retains the original single-tree limit for legacy keys', async () => {
    await expect(
      service.filterResourceScope('ns', 'personal', 'user', ['mine', 'shared']),
    ).resolves.toEqual(['mine']);
  });

  it('resolves default creates to Personal but honors explicit Team', async () => {
    await expect(
      service.resolveResourceId('ns', scope, undefined, 'user'),
    ).resolves.toBe('personal');
    await expect(
      service.resolveResourceId('ns', scope, 'shared', 'user'),
    ).resolves.toBe('shared');
  });

  it('preserves an explicit assistant destination and does not fallback when it disappears', async () => {
    const saved = { ...scope, defaultResourceId: 'shared' };
    await expect(
      service.resolveResourceId('ns', saved, undefined, 'user'),
    ).resolves.toBe('shared');
    await expect(
      service.resolveResourceId(
        'ns',
        { ...saved, defaultResourceId: 'missing' },
        undefined,
        'user',
      ),
    ).rejects.toThrow();
  });

  it('checks current edit permission and never silently changes destination', async () => {
    permissions.getCurrentPermissions.mockResolvedValue(
      new Map([['shared', ResourcePermission.CAN_VIEW]]),
    );
    await expect(
      service.resolveResourceId(
        'ns',
        scope,
        'shared',
        'user',
        ResourcePermission.CAN_EDIT,
      ),
    ).rejects.toThrow();
    await expect(
      service.uploadFile('ns', scope, 'user', {} as never, undefined, 'shared'),
    ).rejects.toThrow();
    expect(namespaceResources.uploadFile).not.toHaveBeenCalled();
  });

  it('uploads to the default or explicit destination after validation', async () => {
    namespaceResources.uploadFile.mockResolvedValue({
      id: 'new',
      name: 'file',
    });
    await service.uploadFile('ns', scope, 'user', {} as never);
    expect(namespaceResources.uploadFile.mock.calls[0][3]).toBe('personal');
    await service.uploadFile(
      'ns',
      scope,
      'user',
      {} as never,
      undefined,
      'shared',
    );
    expect(namespaceResources.uploadFile.mock.calls[1][3]).toBe('shared');
  });

  it('strips client attrs.origin when creating through the open API', async () => {
    namespaceResources.create.mockResolvedValue({
      id: 'new',
      name: 'folder',
    });
    await service.createResource('ns', scope, 'user', {
      name: 'folder',
      resourceType: ResourceType.FOLDER,
      attrs: { origin: 'agent', url: 'https://example.com' },
    });
    expect(namespaceResources.create).toHaveBeenCalledWith(
      'user',
      'ns',
      expect.objectContaining({
        attrs: { url: 'https://example.com' },
      }),
    );
  });

  it('modifies and deletes the original team resource in place', async () => {
    await service.updateResource('ns', scope, 'user', 'shared', {
      name: 'Renamed',
    });
    expect(namespaceResources.update).toHaveBeenCalledWith(
      'ns',
      'user',
      'shared',
      expect.objectContaining({ name: 'Renamed', parentId: undefined }),
      false,
      undefined,
      undefined,
      { preserveAttrsOrigin: true },
    );
    await service.deleteResource('ns', scope, 'user', 'shared');
    expect(namespaceResources.delete).toHaveBeenCalledWith(
      'user',
      'ns',
      'shared',
    );
  });

  it('lists two navigable roots with correct pagination and total', async () => {
    resources.getResourceOrFail.mockImplementation((_ns, id) =>
      Promise.resolve({
        id,
        parentId: null,
        resourceType: ResourceType.FOLDER,
        attrs: {},
        content: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    namespaceResources.listChildrenWithTotal.mockResolvedValue({
      resources: [],
      total: 0,
    });
    const first = await service.listResources('ns', scope, 'user', {
      offset: 0,
      limit: 1,
    });
    const second = await service.listResources('ns', scope, 'user', {
      offset: 1,
      limit: 1,
    });
    expect(first.total).toBe(2);
    expect(first.resources.map((r) => r.id)).toEqual(['personal']);
    expect(second.resources.map((r) => r.id)).toEqual(['team']);
  });
});
