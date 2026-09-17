import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { RssFoldersQuotaService } from 'omniboxd/rss/rss-folders-quota.service';

const NAMESPACE_ID = 'namespace-id';
const TEAM_ROOT_ID = 'team-root-id';
const PRIVATE_ROOT_ID = 'private-root-id';

describe('RssFoldersQuotaService', () => {
  async function expectAppException(
    promise: Promise<void>,
    code: string,
  ): Promise<void> {
    await expect(promise).rejects.toMatchObject<Partial<AppException>>({
      code,
    });
  }

  function parentsFor(resourceId: string, rootId: string) {
    if (resourceId === rootId) {
      return [{ id: rootId, parentId: null }];
    }
    return [
      { id: resourceId, parentId: rootId },
      { id: rootId, parentId: null },
    ];
  }

  function createService(values?: {
    privateLimit?: number;
    teamLimit?: number;
    activeFolderCount?: number;
    activeFolderRootId?: string;
    parentDeleted?: boolean;
    restoreResource?: Record<string, any> | null;
    extraFolders?: Array<{ id: string }>;
    movedResources?: Array<{ id: string; resourceType: ResourceType }>;
  }) {
    const activeFolderCount = values?.activeFolderCount ?? 0;
    const activeFolderRootId = values?.activeFolderRootId ?? PRIVATE_ROOT_ID;
    const extraFolders = values?.extraFolders ?? [];
    const movedRssFolders = (values?.movedResources ?? []).filter(
      (resource) => resource.resourceType === ResourceType.RSS_FOLDER,
    );
    const folderIds = new Map<string, { id: string }>();
    for (let index = 0; index < activeFolderCount; index += 1) {
      folderIds.set(`rss-folder-${index}`, { id: `rss-folder-${index}` });
    }
    for (const folder of extraFolders) {
      folderIds.set(folder.id, folder);
    }
    for (const folder of movedRssFolders) {
      folderIds.set(folder.id, { id: folder.id });
    }
    const activeFolders = [...folderIds.values()];
    const resourceRepository = {
      findOne: jest.fn().mockResolvedValue(
        values?.restoreResource === undefined
          ? {
              id: 'resource-id',
              parentId: 'parent-id',
              userId: 'user-id',
              resourceType: ResourceType.RSS_FOLDER,
            }
          : values.restoreResource,
      ),
      find: jest.fn().mockResolvedValue(activeFolders),
    };
    const namespaceRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: NAMESPACE_ID, rootResourceId: TEAM_ROOT_ID }),
    };
    const namespaceMemberRepository = {
      findOne: jest.fn().mockResolvedValue({
        userId: 'user-id',
        rootResourceId: PRIVATE_ROOT_ID,
      }),
    };
    const resolveParents = (resourceId: string) => {
      if (resourceId === 'nested-rss-id') {
        return [
          { id: 'nested-rss-id', parentId: 'ordinary-folder-id' },
          { id: 'ordinary-folder-id', parentId: TEAM_ROOT_ID },
          { id: TEAM_ROOT_ID, parentId: null },
        ];
      }
      if (resourceId === 'team-parent-id' || resourceId === 'team-rss-id') {
        return parentsFor(resourceId, TEAM_ROOT_ID);
      }
      if (resourceId.startsWith('rss-folder-')) {
        return parentsFor(resourceId, activeFolderRootId);
      }
      return parentsFor(resourceId, PRIVATE_ROOT_ID);
    };
    const resourcesService = {
      getParentResources: jest
        .fn()
        .mockImplementation((_namespaceId: string, resourceId: string) =>
          Promise.resolve(resolveParents(resourceId)),
        ),
      getParentResourcesOrFail: jest
        .fn()
        .mockImplementation((_namespaceId: string, resourceId: string) =>
          Promise.resolve(resolveParents(resourceId)),
        ),
      getAllSubResources: jest.fn(),
      isParentDeleted: jest
        .fn()
        .mockResolvedValue(values?.parentDeleted ?? false),
    };
    const namespacesQuotaService = {
      getNamespaceUsage: jest.fn().mockResolvedValue({
        rssFolderPrivateLimit: values?.privateLimit ?? 1,
        rssFolderTeamLimit: values?.teamLimit ?? 1,
      }),
    };
    const i18n = {
      t: jest.fn((key: string) => key),
    };
    const entityManager = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn().mockReturnValue({
        find: jest.fn().mockResolvedValue(activeFolders),
      }),
    };
    const service = new RssFoldersQuotaService(
      resourceRepository as any,
      namespaceRepository as any,
      namespaceMemberRepository as any,
      resourcesService as any,
      namespacesQuotaService as any,
      i18n as any,
    );

    return {
      entityManager,
      i18n,
      resourceRepository,
      resourcesService,
      namespacesQuotaService,
      service,
    };
  }

  it('rejects create when active folder count reaches the space quota', async () => {
    const { entityManager, service } = createService({ activeFolderCount: 1 });

    await expectAppException(
      service.assertCreateQuota(
        NAMESPACE_ID,
        'parent-id',
        entityManager as any,
      ),
      'RSS_FOLDER_QUOTA_EXCEEDED',
    );
    expect(entityManager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`rss-folder-quota:${NAMESPACE_ID}:${PRIVATE_ROOT_ID}`],
    );
  });

  it('allows create when under the space quota', async () => {
    const { entityManager, service } = createService({ activeFolderCount: 0 });

    await expect(
      service.assertCreateQuota(
        NAMESPACE_ID,
        'parent-id',
        entityManager as any,
      ),
    ).resolves.toBeUndefined();
  });

  it('skips counting entirely when the limit is unlimited', async () => {
    const { entityManager, resourceRepository, resourcesService, service } =
      createService({
        privateLimit: -1,
        activeFolderCount: 5,
      });

    await expect(
      service.assertCreateQuota(
        NAMESPACE_ID,
        'parent-id',
        entityManager as any,
      ),
    ).resolves.toBeUndefined();
    expect(resourceRepository.find).not.toHaveBeenCalled();
    expect(resourcesService.getAllSubResources).not.toHaveBeenCalled();
    expect(resourcesService.getParentResources).not.toHaveBeenCalled();
    expect(entityManager.query).not.toHaveBeenCalled();
  });

  it('uses the team limit for folders under the teamspace root', async () => {
    const { entityManager, resourcesService, service } = createService({
      privateLimit: -1,
      teamLimit: 1,
      activeFolderCount: 1,
      activeFolderRootId: TEAM_ROOT_ID,
    });
    resourcesService.getParentResourcesOrFail.mockResolvedValue([
      { id: 'parent-id', parentId: TEAM_ROOT_ID },
      { id: TEAM_ROOT_ID, parentId: null },
    ]);

    await expectAppException(
      service.assertCreateQuota(
        NAMESPACE_ID,
        'parent-id',
        entityManager as any,
      ),
      'RSS_FOLDER_QUOTA_EXCEEDED',
    );
  });

  it('rejects restore when active folder count reaches the space quota', async () => {
    const { i18n, service } = createService({ activeFolderCount: 1 });

    await expectAppException(
      service.assertRestoreQuota(NAMESPACE_ID, 'user-id', 'resource-id'),
      'RSS_FOLDER_QUOTA_EXCEEDED',
    );
    expect(i18n.t).toHaveBeenCalledWith('rssFolder.errors.quotaExhausted');
  });

  it('allows restore of non-rss-folder resources', async () => {
    const { service } = createService({
      activeFolderCount: 1,
      restoreResource: {
        id: 'resource-id',
        parentId: 'parent-id',
        userId: 'user-id',
        resourceType: ResourceType.DOC,
      },
    });

    await expect(
      service.assertRestoreQuota(NAMESPACE_ID, 'user-id', 'resource-id'),
    ).resolves.toBeUndefined();
  });

  it('allows same-space move even when the target quota is full', async () => {
    const { entityManager, service } = createService({
      activeFolderCount: 1,
      movedResources: [
        { id: 'resource-id', resourceType: ResourceType.RSS_FOLDER },
      ],
    });
    // Descendants empty; source root resolved from getParentResourcesOrFail defaults to private.
    await expect(
      service.assertMoveQuota(
        NAMESPACE_ID,
        ['resource-id'],
        'parent-id',
        entityManager as any,
      ),
    ).resolves.toBeUndefined();
    expect(entityManager.query).not.toHaveBeenCalled();
  });

  it('rejects cross-space move when the target quota is full', async () => {
    const { entityManager, service } = createService({
      privateLimit: 1,
      teamLimit: 1,
      activeFolderCount: 1,
      movedResources: [
        { id: 'team-rss-id', resourceType: ResourceType.RSS_FOLDER },
      ],
    });

    // Source is team (team-rss-id), target parent resolves to private → incoming=1.
    await expectAppException(
      service.assertMoveQuota(
        NAMESPACE_ID,
        ['team-rss-id'],
        'parent-id',
        entityManager as any,
      ),
      'RSS_FOLDER_QUOTA_EXCEEDED',
    );
    expect(entityManager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`rss-folder-quota:${NAMESPACE_ID}:${PRIVATE_ROOT_ID}`],
    );
  });

  it('skips move quota checks when the target limit is unlimited', async () => {
    const { entityManager, resourceRepository, resourcesService, service } =
      createService({
        privateLimit: -1,
        activeFolderCount: 5,
        movedResources: [
          { id: 'team-rss-id', resourceType: ResourceType.RSS_FOLDER },
        ],
      });

    await expect(
      service.assertMoveQuota(
        NAMESPACE_ID,
        ['team-rss-id'],
        'parent-id',
        entityManager as any,
      ),
    ).resolves.toBeUndefined();
    expect(resourceRepository.find).not.toHaveBeenCalled();
    expect(entityManager.getRepository).not.toHaveBeenCalled();
    expect(resourcesService.getAllSubResources).not.toHaveBeenCalled();
    expect(entityManager.query).not.toHaveBeenCalled();
  });

  it('counts only rss folders under the root', async () => {
    const { resourceRepository, resourcesService, service } = createService({
      activeFolderCount: 2,
    });

    await expect(
      service.countActive(NAMESPACE_ID, PRIVATE_ROOT_ID),
    ).resolves.toBe(2);
    expect(resourceRepository.find).toHaveBeenCalledWith({
      select: ['id'],
      where: {
        namespaceId: NAMESPACE_ID,
        resourceType: ResourceType.RSS_FOLDER,
      },
    });
    expect(resourcesService.getAllSubResources).not.toHaveBeenCalled();
  });

  it('does not count rss folders under a different root', async () => {
    const { service } = createService({
      activeFolderCount: 2,
      activeFolderRootId: TEAM_ROOT_ID,
    });

    await expect(
      service.countActive(NAMESPACE_ID, PRIVATE_ROOT_ID),
    ).resolves.toBe(0);
  });

  it('rejects moving an ordinary folder when nested rss folders would exceed quota', async () => {
    const { entityManager, resourcesService, service } = createService({
      activeFolderCount: 1,
      extraFolders: [{ id: 'nested-rss-id' }],
      movedResources: [
        { id: 'ordinary-folder-id', resourceType: ResourceType.FOLDER },
      ],
    });

    await expectAppException(
      service.assertMoveQuota(
        NAMESPACE_ID,
        ['ordinary-folder-id'],
        'parent-id',
        entityManager as any,
      ),
      'RSS_FOLDER_QUOTA_EXCEEDED',
    );
    expect(resourcesService.getAllSubResources).not.toHaveBeenCalled();
  });
});
