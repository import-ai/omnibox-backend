import { ResourceSortBy, ResourceSortOrder } from '../resources/resource-sort';
import { NamespacesSingleController } from './namespaces.controller';
import { NamespacesService } from './namespaces.service';

describe('NamespacesSingleController', () => {
  const getMe = jest.fn();
  const getRoot = jest.fn();
  const listMembers = jest.fn();
  const controller = new NamespacesSingleController({
    getMe,
    getRoot,
    listMembers,
  } as unknown as NamespacesService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRoot', () => {
    it('passes independent private and teamspace sorting', async () => {
      getRoot.mockResolvedValue({});

      await controller.getRoot('namespace-1', 'user-1', {
        privateSortBy: ResourceSortBy.TITLE,
        privateSortOrder: ResourceSortOrder.ASC,
        teamspaceSortBy: ResourceSortBy.MANUAL,
        teamspaceSortOrder: ResourceSortOrder.ASC,
      });

      expect(getRoot).toHaveBeenCalledWith('namespace-1', 'user-1', {
        private: {
          sortBy: ResourceSortBy.TITLE,
          sortOrder: ResourceSortOrder.ASC,
        },
        teamspace: {
          sortBy: ResourceSortBy.MANUAL,
          sortOrder: ResourceSortOrder.ASC,
        },
      });
    });

    it('uses legacy sorting as the fallback for both spaces', async () => {
      getRoot.mockResolvedValue({});

      await controller.getRoot('namespace-1', 'user-1', {
        sortBy: ResourceSortBy.UPDATED_AT,
        sortOrder: ResourceSortOrder.DESC,
      });

      expect(getRoot).toHaveBeenCalledWith('namespace-1', 'user-1', {
        private: {
          sortBy: ResourceSortBy.UPDATED_AT,
          sortOrder: ResourceSortOrder.DESC,
        },
        teamspace: {
          sortBy: ResourceSortBy.UPDATED_AT,
          sortOrder: ResourceSortOrder.DESC,
        },
      });
    });
  });

  describe('listMembers', () => {
    it('checks namespace membership before returning members', async () => {
      const members = [{ userId: 'user-1' }];
      getMe.mockResolvedValue({ userId: 'user-1' });
      listMembers.mockResolvedValue(members);

      await expect(
        controller.listMembers('namespace-1', 'user-1'),
      ).resolves.toBe(members);
      expect(getMe).toHaveBeenCalledWith('namespace-1', 'user-1');
      expect(listMembers).toHaveBeenCalledWith('namespace-1');
    });

    it('does not return members when membership validation fails', async () => {
      getMe.mockRejectedValue(new Error('not a member'));

      await expect(
        controller.listMembers('namespace-1', 'user-2'),
      ).rejects.toThrow('not a member');
      expect(listMembers).not.toHaveBeenCalled();
    });
  });
});
