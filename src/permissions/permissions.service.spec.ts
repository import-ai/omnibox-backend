import { GroupUser } from 'omniboxd/groups/entities/group-user.entity';
import { NamespaceRole } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { GroupPermission } from 'omniboxd/permissions/entities/group-permission.entity';
import { UserPermission } from 'omniboxd/permissions/entities/user-permission.entity';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';

import { PermissionsService } from './permissions.service';
import { ResourcePermission } from './resource-permission.enum';

describe('PermissionsService', () => {
  // Only these three fields take part in permission resolution.
  const meta = (
    id: string,
    parentId: string | null,
    globalPermission: ResourcePermission | null = null,
  ) => ({ id, parentId, globalPermission }) as ResourceMetaDto;

  function createService(
    dataSource: Record<string, unknown> = {},
    resourcesService: Record<string, unknown> = {},
    namespaceMembersRepository: Record<string, unknown> = {},
  ) {
    return new PermissionsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      namespaceMembersRepository as any,
      dataSource as any,
      {} as any,
      resourcesService as any,
      {} as any,
    );
  }

  it('skips group permission queries when the user has no groups', async () => {
    const find = jest.fn().mockImplementation((entity) => {
      if (entity === GroupUser) {
        return Promise.resolve([]);
      }
      if (entity === UserPermission) {
        return Promise.resolve([
          {
            resourceId: 'child',
            permission: ResourcePermission.CAN_VIEW,
          },
        ]);
      }
      throw new Error(`Unexpected entity: ${entity.name}`);
    });
    const service = createService();

    const result = await service.getCurrentPermissions(
      'user-1',
      'namespace-1',
      [meta('root', null), meta('child', 'root')],
      { find } as any,
    );

    expect(find).toHaveBeenCalledTimes(2);
    expect(result.get('child')).toBe(ResourcePermission.CAN_VIEW);
  });

  it('treats a direct user no_access rule as a terminal denial', async () => {
    const find = jest.fn().mockImplementation((entity) => {
      if (entity === GroupUser) {
        return Promise.resolve([{ groupId: 'group-1' }]);
      }
      if (entity === UserPermission) {
        return Promise.resolve([
          {
            resourceId: 'root',
            userId: 'user-1',
            permission: ResourcePermission.NO_ACCESS,
          },
        ]);
      }
      if (entity === GroupPermission) {
        return Promise.resolve([
          {
            resourceId: 'root',
            groupId: 'group-1',
            permission: ResourcePermission.FULL_ACCESS,
          },
        ]);
      }
      throw new Error(`Unexpected entity: ${entity.name}`);
    });
    const service = createService();

    const result = await service.getCurrentPermissions(
      'user-1',
      'namespace-1',
      [meta('child', 'root'), meta('root', null, ResourcePermission.CAN_VIEW)],
      { find } as any,
    );

    expect(result.get('child')).toBe(ResourcePermission.NO_ACCESS);
    expect(result.get('root')).toBe(ResourcePermission.NO_ACCESS);
  });

  it('treats a direct user no_access rule as a terminal denial for one resource', async () => {
    const repositoryFind = jest.fn().mockImplementation((entity) => {
      if (entity === GroupUser) {
        return Promise.resolve([{ groupId: 'group-1' }]);
      }
      if (entity === UserPermission) {
        return Promise.resolve([
          {
            resourceId: 'root',
            userId: 'user-1',
            permission: ResourcePermission.NO_ACCESS,
          },
        ]);
      }
      if (entity === GroupPermission) {
        return Promise.resolve([
          {
            resourceId: 'root',
            groupId: 'group-1',
            permission: ResourcePermission.FULL_ACCESS,
          },
        ]);
      }
      throw new Error(`Unexpected entity: ${entity.name}`);
    });
    const service = createService();
    const entityManager = {
      getRepository: jest.fn((entity) => ({
        find: () => repositoryFind(entity),
      })),
    };

    await expect(
      service.getCurrentPermission(
        'namespace-1',
        [
          meta('child', 'root'),
          meta('root', null, ResourcePermission.CAN_VIEW),
        ],
        'user-1',
        entityManager as any,
      ),
    ).resolves.toBe(ResourcePermission.NO_ACCESS);
  });

  describe('canManageGroupPermission', () => {
    it.each([
      [NamespaceRole.OWNER, true],
      [NamespaceRole.ADMIN, true],
      [NamespaceRole.MEMBER, false],
    ])(
      'allows only owner/admin with full access (role: %s)',
      async (role, expected) => {
        const findOne = jest.fn().mockResolvedValue({ role });
        const service = createService({}, {}, { findOne });
        jest.spyOn(service, 'userHasPermission').mockResolvedValue(true);

        await expect(
          service.canManageGroupPermission(
            'namespace-1',
            'resource-1',
            'user-1',
          ),
        ).resolves.toBe(expected);
        expect(findOne).toHaveBeenCalledWith({
          where: {
            namespaceId: 'namespace-1',
            userId: 'user-1',
            deletedAt: expect.anything(),
          },
        });
      },
    );

    it('rejects a namespace owner/admin without full access', async () => {
      const service = createService(
        {},
        {},
        { findOne: jest.fn().mockResolvedValue({ role: NamespaceRole.ADMIN }) },
      );
      jest.spyOn(service, 'userHasPermission').mockResolvedValue(false);

      await expect(
        service.canManageGroupPermission('namespace-1', 'resource-1', 'user-1'),
      ).resolves.toBe(false);
    });

    it('rejects a user without an active namespace membership', async () => {
      const service = createService(
        {},
        {},
        { findOne: jest.fn().mockResolvedValue(null) },
      );
      jest.spyOn(service, 'userHasPermission').mockResolvedValue(true);

      await expect(
        service.canManageGroupPermission('namespace-1', 'resource-1', 'user-1'),
      ).resolves.toBe(false);
    });
  });

  describe('batchGetHasChildren', () => {
    const root = meta('root', null, ResourcePermission.CAN_VIEW);
    const parent = (id: string) => meta(id, 'root');

    it('settles parents holding an inheriting child without reading their children', async () => {
      const query = jest
        .fn()
        .mockResolvedValue([{ parentId: 'parent-with-inheriting-child' }]);
      const getChildren = jest.fn();
      const service = createService({ manager: { query } }, { getChildren });

      const result = await service.batchGetHasChildren(
        'namespace-1',
        '00000000-0000-0000-0000-000000000001',
        [parent('parent-with-inheriting-child')],
        [root],
      );

      expect(result).toEqual(new Map([['parent-with-inheriting-child', true]]));
      expect(getChildren).not.toHaveBeenCalled();
    });

    it('resolves only the parents the fast path could not settle', async () => {
      const query = jest.fn().mockResolvedValue([{ parentId: 'inheriting' }]);
      const getChildren = jest.fn().mockResolvedValue([
        { id: 'granted-child', parentId: 'granted', globalPermission: null },
        {
          id: 'hidden-child',
          parentId: 'hidden',
          globalPermission: ResourcePermission.NO_ACCESS,
        },
      ]);
      const find = jest.fn().mockImplementation((entity) => {
        if (entity === GroupUser) return Promise.resolve([]);
        if (entity === UserPermission) {
          return Promise.resolve([
            {
              resourceId: 'granted-child',
              permission: ResourcePermission.CAN_VIEW,
            },
          ]);
        }
        throw new Error(`Unexpected entity: ${entity.name}`);
      });
      const service = createService(
        { manager: { query, find } },
        { getChildren },
      );

      const result = await service.batchGetHasChildren(
        'namespace-1',
        '00000000-0000-0000-0000-000000000001',
        [
          parent('inheriting'),
          parent('granted'),
          parent('hidden'),
          parent('empty'),
        ],
        [root],
      );

      expect(result).toEqual(
        new Map([
          ['inheriting', true],
          ['granted', true],
          ['hidden', false],
          ['empty', false],
        ]),
      );
      expect(getChildren).toHaveBeenCalledWith(
        'namespace-1',
        ['granted', 'hidden', 'empty'],
        {},
        expect.anything(),
      );
    });

    it('does not query when no parent ids are provided', async () => {
      const query = jest.fn();
      const service = createService({ manager: { query } });

      await expect(
        service.batchGetHasChildren('namespace-1', 'user-1', [], []),
      ).resolves.toEqual(new Map());
      expect(query).not.toHaveBeenCalled();
    });
  });
});
