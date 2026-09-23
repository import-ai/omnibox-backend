import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceCommentAnchorsService } from 'omniboxd/resource-comments/resource-comment-anchors.service';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';

import { NamespaceResourcesService } from './namespace-resources.service';

describe('NamespaceResourcesService', () => {
  const namespaceId = 'namespace-1';
  const resourceId = 'smart-folder-1';
  const userId = 'user-1';

  function createService() {
    const resourcesService = {
      getParentResourcesOrFail: jest.fn(),
      getChildren: jest.fn(),
      resourceFilter: jest.fn(),
    };
    const permissionsService = {
      batchGetHasChildren: jest.fn(),
      getCurrentPermissions: jest.fn(),
    };
    const smartFoldersService = {
      listChildrenWithTotal: jest.fn(),
    };
    const resourceSortPreferenceService = {
      getSortOptions: jest.fn().mockResolvedValue({}),
    };
    const service = new NamespaceResourcesService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      permissionsService as any,
      {} as any,
      {} as any,
      {} as ResourceCommentAnchorsService,
      resourcesService as any,
      {} as any,
      {} as any,
      {} as any,
      resourceSortPreferenceService as any,
      smartFoldersService as any,
      {} as any,
      {} as any,
    );

    return {
      permissionsService,
      resourcesService,
      service,
      smartFoldersService,
    };
  }

  it('delegates smart folder children to SmartFoldersService virtual list', async () => {
    const { resourcesService, service, smartFoldersService } = createService();
    const children = [
      {
        id: 'doc-1',
        name: '命中文档',
        resourceType: ResourceType.DOC,
      },
    ];
    // getParentResourcesOrFail returns the chain target-first ([target, ..., root]).
    resourcesService.getParentResourcesOrFail.mockResolvedValue([
      {
        id: resourceId,
        resourceType: ResourceType.SMART_FOLDER,
      },
      {
        id: 'private-root',
        resourceType: ResourceType.FOLDER,
      },
    ]);
    smartFoldersService.listChildrenWithTotal.mockResolvedValue({
      resources: children,
      total: children.length,
    });

    const result = await service.listChildren(namespaceId, resourceId, userId, {
      limit: 10,
      offset: 0,
    });

    expect(smartFoldersService.listChildrenWithTotal).toHaveBeenCalledWith(
      userId,
      namespaceId,
      resourceId,
      { limit: 10, offset: 0 },
    );
    expect(resourcesService.getChildren).not.toHaveBeenCalled();
    expect(result).toBe(children);
  });

  it('forwards X-Timezone to smart folder matching', async () => {
    const { resourcesService, service, smartFoldersService } = createService();
    resourcesService.getParentResourcesOrFail.mockResolvedValue([
      {
        id: resourceId,
        resourceType: ResourceType.SMART_FOLDER,
      },
    ]);
    smartFoldersService.listChildrenWithTotal.mockResolvedValue({
      resources: [],
      total: 0,
    });

    await service.listChildren(namespaceId, resourceId, userId, {
      limit: 10,
      offset: 0,
      timeZone: 'Asia/Shanghai',
    });

    expect(smartFoldersService.listChildrenWithTotal).toHaveBeenCalledWith(
      userId,
      namespaceId,
      resourceId,
      { limit: 10, offset: 0, timeZone: 'Asia/Shanghai' },
    );
  });

  it('returns an empty filter result when no resources are accessible', async () => {
    const { resourcesService, service } = createService();

    await expect(
      service.resourceFilter(namespaceId, [], {
        resourceTypes: [ResourceType.SMART_FOLDER],
      }),
    ).resolves.toEqual({ resources: [], total: 0 });
    expect(resourcesService.resourceFilter).not.toHaveBeenCalled();
  });

  it('batch checks visible child markers for every paged resource', async () => {
    const { permissionsService, resourcesService, service } = createService();
    const now = new Date('2026-08-25T00:00:00.000Z');
    const target = {
      id: resourceId,
      parentId: 'private-root',
      resourceType: ResourceType.FOLDER,
      globalPermission: ResourcePermission.FULL_ACCESS,
    };
    const root = {
      id: 'private-root',
      parentId: null,
      resourceType: ResourceType.FOLDER,
      globalPermission: ResourcePermission.FULL_ACCESS,
    };
    const children = ['folder-with-child', 'empty-folder'].map((id) => ({
      id,
      parentId: resourceId,
      name: id,
      resourceType: ResourceType.FOLDER,
      globalPermission: null,
      attrs: {},
      content: '',
      createdAt: now,
      updatedAt: now,
      fileId: null,
      tagIds: [],
      manualSortInitializedAt: null,
    }));
    resourcesService.getParentResourcesOrFail.mockResolvedValue([target, root]);
    resourcesService.getChildren.mockResolvedValue(children);
    permissionsService.getCurrentPermissions.mockResolvedValue(
      new Map(
        [target, root, ...children].map((resource) => [
          resource.id,
          ResourcePermission.CAN_VIEW,
        ]),
      ),
    );
    permissionsService.batchGetHasChildren.mockResolvedValue(
      new Map([
        ['folder-with-child', true],
        ['empty-folder', false],
      ]),
    );

    const result = await service.listChildren(namespaceId, resourceId, userId);

    expect(resourcesService.getChildren).toHaveBeenCalledTimes(1);
    expect(permissionsService.batchGetHasChildren).toHaveBeenCalledWith(
      namespaceId,
      userId,
      expect.arrayContaining([
        expect.objectContaining({ id: 'folder-with-child' }),
        expect.objectContaining({ id: 'empty-folder' }),
      ]),
      [target, root],
      undefined,
    );
    expect(permissionsService.getCurrentPermissions).toHaveBeenCalledTimes(1);
    expect(
      result.map((resource) => [resource.id, resource.hasChildren]),
    ).toEqual([
      ['folder-with-child', true],
      ['empty-folder', false],
    ]);
  });

  describe('recent', () => {
    const now = new Date('2026-09-16T00:00:00.000Z');
    const root = {
      id: 'root',
      parentId: null as string | null,
      name: 'root',
      resourceType: ResourceType.FOLDER,
      attrs: {},
      createdAt: now,
      updatedAt: now,
    };

    function doc(id: string, extra: Record<string, unknown> = {}) {
      return {
        id,
        parentId: 'root',
        name: id,
        resourceType: ResourceType.DOC,
        attrs: {},
        createdAt: now,
        updatedAt: now,
        ...extra,
      };
    }

    function createRecentService() {
      const resourceRepository = { find: jest.fn() };
      const resourcesService = {
        getParentResourcesOrFail: jest.fn(),
        getChildren: jest.fn(),
        resourceFilter: jest.fn(),
        batchGetParentResources: jest.fn(),
        getContents: jest.fn(),
      };
      const permissionsService = {
        batchGetHasChildren: jest.fn(),
        getCurrentPermissions: jest.fn(),
        filterResourcesByPermission: jest.fn(),
      };
      const resourceAttachmentsService = {
        getFirstAttachments: jest.fn(),
      };
      const service = new NamespaceResourcesService(
        resourceRepository as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        permissionsService as any,
        resourceAttachmentsService as any,
        {} as any,
        {} as ResourceCommentAnchorsService,
        resourcesService as any,
        {} as any,
        {} as any,
        {} as any,
        { getSortOptions: jest.fn().mockResolvedValue({}) } as any,
        {} as any,
        {} as any,
        {} as any,
      );
      return {
        service,
        resourceRepository,
        resourcesService,
        permissionsService,
        resourceAttachmentsService,
      };
    }

    it('pages visible content without loading sibling children', async () => {
      const {
        service,
        resourceRepository,
        resourcesService,
        permissionsService,
      } = createRecentService();
      const visible = doc('doc-1');
      resourceRepository.find.mockResolvedValue([visible]);
      resourcesService.batchGetParentResources.mockResolvedValue(
        new Map([
          [visible.id, visible],
          [root.id, root],
        ]),
      );
      permissionsService.filterResourcesByPermission.mockResolvedValue([
        visible,
        root,
      ]);

      const result = await service.recent(namespaceId, userId, 6, 0);

      expect(result.map((resource) => resource.id)).toEqual(['doc-1']);
      expect(resourcesService.getChildren).not.toHaveBeenCalled();
      expect(resourceRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
          skip: 0,
        }),
      );
    });

    it('drops resources whose ancestor chain does not reach root', async () => {
      const {
        service,
        resourceRepository,
        resourcesService,
        permissionsService,
      } = createRecentService();
      const orphan = doc('orphan');
      resourceRepository.find.mockResolvedValue([orphan]);
      resourcesService.batchGetParentResources.mockResolvedValue(
        new Map([[orphan.id, orphan]]),
      );
      permissionsService.filterResourcesByPermission.mockResolvedValue([
        orphan,
      ]);

      await expect(service.recent(namespaceId, userId, 6, 0)).resolves.toEqual(
        [],
      );
    });

    it('loads content and first attachments by id when summary is true', async () => {
      const {
        service,
        resourceRepository,
        resourcesService,
        permissionsService,
        resourceAttachmentsService,
      } = createRecentService();
      const visible = doc('doc-1');
      resourceRepository.find.mockResolvedValue([visible]);
      resourcesService.batchGetParentResources.mockResolvedValue(
        new Map([
          [visible.id, visible],
          [root.id, root],
        ]),
      );
      permissionsService.filterResourcesByPermission.mockResolvedValue([
        visible,
        root,
      ]);
      resourcesService.getContents.mockResolvedValue(
        new Map([['doc-1', 'hello world']]),
      );
      resourceAttachmentsService.getFirstAttachments.mockResolvedValue(
        new Map([['doc-1', 'att-1']]),
      );

      const result = await service.recent(namespaceId, userId, 6, 0, {
        summary: true,
      });

      expect(resourcesService.getContents).toHaveBeenCalledWith(namespaceId, [
        'doc-1',
      ]);
      expect(resourcesService.getChildren).not.toHaveBeenCalled();
      expect(result[0].content).toBe('hello world');
      expect(result[0].firstAttachment).toBe('att-1');
    });

    it('applies offset after permission filtering', async () => {
      const {
        service,
        resourceRepository,
        resourcesService,
        permissionsService,
      } = createRecentService();
      const first = doc('doc-1');
      const second = doc('doc-2');
      resourceRepository.find.mockResolvedValue([first, second]);
      resourcesService.batchGetParentResources.mockResolvedValue(
        new Map([
          [first.id, first],
          [second.id, second],
          [root.id, root],
        ]),
      );
      permissionsService.filterResourcesByPermission.mockResolvedValue([
        first,
        second,
        root,
      ]);

      const result = await service.recent(namespaceId, userId, 1, 1);
      expect(result.map((resource) => resource.id)).toEqual(['doc-2']);
    });
  });
});
