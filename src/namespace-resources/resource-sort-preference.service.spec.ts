import {
  ResourceSortBy,
  ResourceSortOrder,
  ResourceSortSpaceType,
} from 'omniboxd/resources/resource-sort';

import { UpdateResourceSortPreferenceDto } from './dto/resource-sort-preference.dto';
import { ResourceSortPreferenceService } from './resource-sort-preference.service';

describe('ResourceSortPreferenceService', () => {
  const namespaceId = 'namespace-1';
  const userId = 'user-1';

  function createService() {
    const preferenceRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const namespaceMemberRepository = {
      findOne: jest.fn(),
    };
    const i18n = {
      t: jest.fn().mockReturnValue('not a member'),
    };
    const service = new ResourceSortPreferenceService(
      preferenceRepository as any,
      namespaceMemberRepository as any,
      i18n as any,
    );

    return { preferenceRepository, namespaceMemberRepository, service };
  }

  it('returns defaults for spaces without a saved preference', async () => {
    const { namespaceMemberRepository, preferenceRepository, service } =
      createService();
    namespaceMemberRepository.findOne.mockResolvedValue({ id: 'member-1' });
    preferenceRepository.find.mockResolvedValue([]);

    await expect(service.list(userId, namespaceId)).resolves.toEqual({
      private: {
        spaceType: ResourceSortSpaceType.PRIVATE,
        sortBy: ResourceSortBy.UPDATED_AT,
        sortOrder: ResourceSortOrder.DESC,
      },
      teamspace: {
        spaceType: ResourceSortSpaceType.TEAMSPACE,
        sortBy: ResourceSortBy.UPDATED_AT,
        sortOrder: ResourceSortOrder.DESC,
      },
    });
  });

  it('rejects preference access for non-members', async () => {
    const { namespaceMemberRepository, service } = createService();
    namespaceMemberRepository.findOne.mockResolvedValue(null);

    await expect(service.list(userId, namespaceId)).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
  });

  it('upserts and returns a changed preference', async () => {
    const { namespaceMemberRepository, preferenceRepository, service } =
      createService();
    namespaceMemberRepository.findOne.mockResolvedValue({ id: 'member-1' });
    const queryBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orUpdate: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    preferenceRepository.createQueryBuilder.mockReturnValue(queryBuilder);
    const dto = {
      spaceType: ResourceSortSpaceType.PRIVATE,
      sortBy: ResourceSortBy.TITLE,
      sortOrder: ResourceSortOrder.ASC,
    } as UpdateResourceSortPreferenceDto;

    await expect(service.update(userId, namespaceId, dto)).resolves.toEqual({
      spaceType: ResourceSortSpaceType.PRIVATE,
      sortBy: ResourceSortBy.TITLE,
      sortOrder: ResourceSortOrder.ASC,
    });
    expect(queryBuilder.values).toHaveBeenCalledWith({
      userId,
      namespaceId,
      spaceType: ResourceSortSpaceType.PRIVATE,
      sortBy: ResourceSortBy.TITLE,
      sortOrder: ResourceSortOrder.ASC,
    });
  });
});
