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
