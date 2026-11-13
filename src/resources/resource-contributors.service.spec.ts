import { ResourceType } from './entities/resource.entity';
import { ResourceContributorsService } from './resource-contributors.service';

function createService() {
  const insert = {
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };
  const queryBuilder = {
    insert: jest.fn().mockReturnValue(insert),
  };
  const manager = {
    count: jest.fn().mockResolvedValue(1),
    query: jest.fn().mockResolvedValue([{ ok: 1 }]),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn(),
  };
  const service = new ResourceContributorsService(
    { manager, findOne: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, manager, insert };
}

const edit = {
  namespaceId: 'namespace-1',
  resourceId: 'doc-1',
  resourceType: ResourceType.DOC,
  creatorUserId: 'creator',
  actorUserId: 'editor',
  parentId: 'folder-1',
  explicitNameChanged: false,
  contentChanged: true,
  tagsChanged: false,
};

describe('ResourceContributorsService.recordEdit', () => {
  it('records the first team-space edit by another member', async () => {
    const { service, manager, insert } = createService();

    await service.recordEdit(manager as never, edit);

    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        namespaceId: 'namespace-1',
        resourceId: 'doc-1',
        userId: 'editor',
      }),
    );
    expect(insert.orIgnore).toHaveBeenCalled();
  });

  it.each([ResourceType.LINK, ResourceType.FILE])(
    'records a team-space edit on a %s resource',
    async (resourceType) => {
      const { service, manager, insert } = createService();

      await service.recordEdit(manager as never, {
        ...edit,
        resourceType,
      });

      expect(insert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId: 'doc-1',
          userId: 'editor',
        }),
      );
    },
  );

  it('does not record the creator, a non-member, a private doc, or a non-edit', async () => {
    const { service, manager, insert } = createService();

    await service.recordEdit(manager as never, {
      ...edit,
      actorUserId: 'creator',
    });
    manager.count.mockResolvedValueOnce(0);
    await service.recordEdit(manager as never, edit);
    manager.count.mockResolvedValue(1);
    manager.query.mockResolvedValueOnce([]);
    await service.recordEdit(manager as never, edit);
    await service.recordEdit(manager as never, {
      ...edit,
      resourceType: ResourceType.FOLDER,
    });
    await service.recordEdit(manager as never, {
      ...edit,
      resourceType: ResourceType.RSS_ITEM,
    });
    await service.recordEdit(manager as never, {
      ...edit,
      contentChanged: false,
    });

    expect(insert.execute).not.toHaveBeenCalled();
  });

  it('records a tag-only or title change', async () => {
    const { service, manager, insert } = createService();

    await service.recordEdit(manager as never, {
      ...edit,
      contentChanged: false,
      tagsChanged: true,
    });
    await service.recordEdit(manager as never, {
      ...edit,
      contentChanged: false,
      explicitNameChanged: true,
    });

    expect(insert.execute).toHaveBeenCalledTimes(2);
  });
});

describe('ResourceContributorsService.present', () => {
  function createService(resourceType: ResourceType) {
    const manager = {
      query: jest.fn().mockResolvedValue([{ ok: 1 }]),
    };
    const service = new ResourceContributorsService(
      {
        manager,
        findOne: jest.fn().mockResolvedValue({
          id: 'resource-1',
          namespaceId: 'namespace-1',
          parentId: 'team-root',
          resourceType,
          userId: 'creator',
        }),
      } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      { find: jest.fn().mockResolvedValue([]) } as never,
      {
        find: jest.fn().mockResolvedValue([
          {
            namespaceId: 'namespace-1',
            userId: 'creator',
            nickname: 'Lizhi',
          },
        ]),
      } as never,
      {
        find: jest
          .fn()
          .mockResolvedValue([
            { id: 'creator', username: 'lizhi', email: 'lizhi@example.com' },
          ]),
      } as never,
    );
    return { service, manager };
  }

  it.each([ResourceType.LINK, ResourceType.FILE])(
    'returns the creator for a team %s resource',
    async (resourceType) => {
      const { service } = createService(resourceType);

      await expect(
        service.present('namespace-1', 'resource-1', true),
      ).resolves.toMatchObject({
        creator: {
          label: 'Lizhi（lizhi）',
          interactive: true,
          user_id: 'creator',
        },
        collaborators: [],
      });
    },
  );

  it('returns no people for a private resource', async () => {
    const { service, manager } = createService(ResourceType.LINK);
    manager.query.mockResolvedValueOnce([]);

    await expect(
      service.present('namespace-1', 'resource-1', true),
    ).resolves.toEqual({ creator: null, collaborators: [] });
  });

  it('returns no people for a folder', async () => {
    const { service, manager } = createService(ResourceType.FOLDER);

    await expect(
      service.present('namespace-1', 'resource-1', true),
    ).resolves.toEqual({ creator: null, collaborators: [] });
    expect(manager.query).not.toHaveBeenCalled();
  });
});
