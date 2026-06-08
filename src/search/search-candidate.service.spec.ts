import { SearchCandidateService } from './search-candidate.service';
import {
  SmartFolderField,
  SmartFolderMatchMode,
  SmartFolderOperator,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';

describe('SearchCandidateService', () => {
  const namespaceId = 'namespace-id';
  const userId = 'user-id';

  function createService() {
    const namespaceResourcesService = {
      getAllResourcesByUser: jest.fn().mockResolvedValue([
        {
          id: 'older-resource-id',
        },
        {
          id: 'newer-resource-id',
        },
      ]),
    };
    const searchResourceFilterService = {
      getMatchedResourceIds: jest
        .fn()
        .mockResolvedValue(new Set(['newer-resource-id'])),
    };
    const service = new SearchCandidateService(
      namespaceResourcesService as any,
      searchResourceFilterService as any,
    );

    return {
      namespaceResourcesService,
      searchResourceFilterService,
      service,
    };
  }

  it('returns matched visible resource IDs in visible resource order', async () => {
    const { namespaceResourcesService, searchResourceFilterService, service } =
      createService();
    const options = {
      conditions: [
        {
          field: SmartFolderField.TITLE,
          operator: SmartFolderOperator.CONTAINS,
          value: 'roadmap',
        },
      ],
      matchMode: SmartFolderMatchMode.ALL,
    };

    const result = await service.getFilterCandidateResourceIds(
      userId,
      namespaceId,
      options,
    );

    expect(
      namespaceResourcesService.getAllResourcesByUser,
    ).toHaveBeenCalledWith(userId, namespaceId);
    expect(
      searchResourceFilterService.getMatchedResourceIds,
    ).toHaveBeenCalledWith(
      namespaceId,
      ['older-resource-id', 'newer-resource-id'],
      options,
    );
    expect(result).toEqual(['newer-resource-id']);
  });

  it('returns null without loading resources when no condition is provided', async () => {
    const { namespaceResourcesService, searchResourceFilterService, service } =
      createService();

    const result = await service.getFilterCandidateResourceIds(
      userId,
      namespaceId,
      {
        conditions: [],
      },
    );

    expect(
      namespaceResourcesService.getAllResourcesByUser,
    ).not.toHaveBeenCalled();
    expect(
      searchResourceFilterService.getMatchedResourceIds,
    ).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
