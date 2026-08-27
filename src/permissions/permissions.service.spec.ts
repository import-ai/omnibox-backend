import { GroupUser } from 'omniboxd/groups/entities/group-user.entity';
import { UserPermission } from 'omniboxd/permissions/entities/user-permission.entity';

import { PermissionsService } from './permissions.service';
import { ResourcePermission } from './resource-permission.enum';

describe('PermissionsService', () => {
  function createService(
    dataSource: Record<string, unknown> = {},
    resourcesService: Record<string, unknown> = {},
  ) {
    return new PermissionsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
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
      [
        { id: 'root', parentId: null, globalPermission: null },
        { id: 'child', parentId: 'root', globalPermission: null },
      ],
      { find } as any,
    );

    expect(find).toHaveBeenCalledTimes(2);
    expect(result.get('child')).toBe(ResourcePermission.CAN_VIEW);
  });

  describe('batchGetHasChildren', () => {
    const root = {
      id: 'root',
      parentId: null,
      globalPermission: ResourcePermission.CAN_VIEW,
    };
    const parent = (id: string) => ({
      id,
      parentId: 'root',
      globalPermission: null,
    });

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
