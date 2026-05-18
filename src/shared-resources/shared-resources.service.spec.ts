import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { SharedResourcesService } from 'omniboxd/shared-resources/shared-resources.service';

describe('SharedResourcesService.getSharedResourceChildren', () => {
  function createService() {
    const resourcesService = {
      getResource: jest.fn(),
      getChildren: jest.fn(),
    };
    const smartFoldersService = {
      listChildren: jest.fn().mockResolvedValue([
        {
          id: 'matched-doc-id',
          parentId: 'smart-folder-id',
          name: 'Matched doc',
          resourceType: ResourceType.DOC,
          createdAt: new Date('2026-05-18T00:00:00.000Z'),
          updatedAt: new Date('2026-05-18T00:00:00.000Z'),
          hasChildren: false,
          attrs: {
            transcript: 'hidden',
            video_info: 'hidden',
            kept: true,
          },
        },
      ]),
    };
    const service = new SharedResourcesService(
      resourcesService as any,
      smartFoldersService as any,
      {} as any,
      { t: jest.fn((key: string) => key) } as any,
    );

    return { resourcesService, service, smartFoldersService };
  }

  it('expands a shared smart folder through matched smart-folder children', async () => {
    const { resourcesService, service, smartFoldersService } = createService();
    resourcesService.getResource.mockResolvedValue({
      id: 'smart-folder-id',
      namespaceId: 'namespace-id',
      resourceType: ResourceType.SMART_FOLDER,
    });

    const result = await service.getSharedResourceChildren(
      {
        id: 'share-id',
        namespaceId: 'namespace-id',
        resourceId: 'smart-folder-id',
        userId: 'owner-user-id',
        allResources: true,
      } as any,
      'smart-folder-id',
    );

    expect(smartFoldersService.listChildren).toHaveBeenCalledWith(
      'owner-user-id',
      'namespace-id',
      'smart-folder-id',
    );
    expect(resourcesService.getChildren).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        id: 'matched-doc-id',
        parentId: 'smart-folder-id',
        name: 'Matched doc',
        resourceType: ResourceType.DOC,
        hasChildren: false,
        attrs: { kept: true },
      }),
    ]);
  });
});
