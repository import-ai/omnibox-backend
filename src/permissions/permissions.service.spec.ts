import { GroupUser } from 'omniboxd/groups/entities/group-user.entity';
import { UserPermission } from 'omniboxd/permissions/entities/user-permission.entity';

import { PermissionsService } from './permissions.service';
import { ResourcePermission } from './resource-permission.enum';

describe('PermissionsService', () => {
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
    const service = new PermissionsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

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
});
