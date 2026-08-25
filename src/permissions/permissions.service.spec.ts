import { GroupUser } from 'omniboxd/groups/entities/group-user.entity';
import { UserPermission } from 'omniboxd/permissions/entities/user-permission.entity';

import { PermissionsService } from './permissions.service';
import { ResourcePermission } from './resource-permission.enum';

describe('PermissionsService', () => {
  function createService(dataSource: Record<string, unknown> = {}) {
    return new PermissionsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
      {} as any,
      {} as any,
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

  it('batch checks direct children and defaults missing parents to false', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([
        { parentId: 'parent-with-unrestricted-child' },
        { parentId: 'parent-with-direct-grant' },
      ]);
    const service = createService({ manager: { query } });

    const result = await service.batchGetHasChildren(
      'namespace-1',
      '00000000-0000-0000-0000-000000000001',
      [
        'empty-parent',
        'parent-with-unrestricted-child',
        'parent-with-direct-grant',
        'parent-with-hidden-child',
      ],
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WITH children AS'),
      [
        'namespace-1',
        '00000000-0000-0000-0000-000000000001',
        [
          'empty-parent',
          'parent-with-unrestricted-child',
          'parent-with-direct-grant',
          'parent-with-hidden-child',
        ],
        ResourcePermission.NO_ACCESS,
      ],
    );
    expect(result).toEqual(
      new Map([
        ['empty-parent', false],
        ['parent-with-unrestricted-child', true],
        ['parent-with-direct-grant', true],
        ['parent-with-hidden-child', false],
      ]),
    );
  });

  it('does not query when no parent ids are provided', async () => {
    const query = jest.fn();
    const service = createService({ manager: { query } });

    await expect(
      service.batchGetHasChildren('namespace-1', 'user-1', []),
    ).resolves.toEqual(new Map());
    expect(query).not.toHaveBeenCalled();
  });
});
