import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { SharedResourceTagsService } from 'omniboxd/shared-resource-tags/shared-resource-tags.service';

describe('SharedResourceTagsService', () => {
  it('counts tags from matched resources exposed by a shared smart folder root', async () => {
    const tagService = {
      findByIds: jest.fn().mockResolvedValue([
        { id: 'tag-a', name: 'Tag A' },
        { id: 'tag-b', name: 'Tag B' },
      ]),
    };
    const sharedResourcesService = {
      getAllSharedResources: jest.fn().mockResolvedValue([
        {
          id: 'smart-folder-id',
          resourceType: ResourceType.SMART_FOLDER,
        },
        {
          id: 'matched-doc-id',
          resourceType: ResourceType.DOC,
        },
      ]),
      getAndValidateResource: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'smart-folder-id',
          tagIds: ['tag-a'],
        })
        .mockResolvedValueOnce({
          id: 'matched-doc-id',
          tagIds: ['tag-a', 'tag-b'],
        }),
    };
    const service = new SharedResourceTagsService(
      tagService as any,
      sharedResourcesService as any,
    );

    const result = await service.listTagsWithCount(
      {
        id: 'share-id',
        namespaceId: 'namespace-id',
        resourceId: 'smart-folder-id',
        userId: 'owner-user-id',
        allResources: true,
      } as any,
      {},
    );

    expect(sharedResourcesService.getAllSharedResources).toHaveBeenCalled();
    expect(tagService.findByIds).toHaveBeenCalledWith('namespace-id', [
      'tag-a',
      'tag-b',
    ]);
    expect(result.tags).toEqual([
      expect.objectContaining({ id: 'tag-a', resourceCnt: 2 }),
      expect.objectContaining({ id: 'tag-b', resourceCnt: 1 }),
    ]);
    expect(result.total).toBe(2);
  });
});
