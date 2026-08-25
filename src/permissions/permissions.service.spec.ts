import { PermissionsService } from './permissions.service';
import { ResourcePermission } from './resource-permission.enum';

describe('PermissionsService', () => {
  it('returns parent ids reported by the visible-child query', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([
        { parent_id: 'folder-1' },
        { parent_id: 'folder-2' },
      ]);
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

    const result = await service.getParentIdsWithVisibleChildren(
      'user-1',
      'namespace-1',
      ['folder-1', 'folder-2', 'folder-3'],
      { query } as any,
    );

    expect(query).toHaveBeenCalledWith(expect.any(String), [
      'namespace-1',
      ['folder-1', 'folder-2', 'folder-3'],
      'user-1',
      ResourcePermission.NO_ACCESS,
    ]);
    expect(result).toEqual(new Set(['folder-1', 'folder-2']));
  });

  it('does not query the database for an empty parent list', async () => {
    const query = jest.fn();
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

    await expect(
      service.getParentIdsWithVisibleChildren('user-1', 'namespace-1', [], {
        query,
      } as any),
    ).resolves.toEqual(new Set());
    expect(query).not.toHaveBeenCalled();
  });
});
