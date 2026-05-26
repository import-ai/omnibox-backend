import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { SharedResourceMetaDto } from 'omniboxd/shared-resources/dto/shared-resource-meta.dto';
import { SharedVfsService } from 'omniboxd/shared-vfs/shared-vfs.service';

function createSharedResourceMeta(
  overrides: Partial<SharedResourceMetaDto> & { id: string },
): SharedResourceMetaDto {
  const dto = new SharedResourceMetaDto();
  dto.id = overrides.id;
  dto.parentId = overrides.parentId ?? null;
  dto.name = overrides.name ?? overrides.id;
  dto.resourceType = overrides.resourceType ?? ResourceType.DOC;
  dto.createdAt = overrides.createdAt ?? new Date('2026-05-18T00:00:00.000Z');
  dto.updatedAt = overrides.updatedAt ?? new Date('2026-05-18T00:00:00.000Z');
  dto.hasChildren = overrides.hasChildren ?? false;
  dto.attrs = overrides.attrs ?? {};
  return dto;
}

function createResourceMeta(
  overrides: Partial<ResourceMetaDto> & { id: string },
): ResourceMetaDto {
  const dto = new ResourceMetaDto();
  dto.id = overrides.id;
  dto.parentId = overrides.parentId ?? null;
  dto.name = overrides.name ?? overrides.id;
  dto.resourceType = overrides.resourceType ?? ResourceType.DOC;
  dto.createdAt = overrides.createdAt ?? new Date('2026-05-18T00:00:00.000Z');
  dto.updatedAt = overrides.updatedAt ?? new Date('2026-05-18T00:00:00.000Z');
  dto.attrs = overrides.attrs ?? {};
  dto.tagIds = overrides.tagIds ?? [];
  dto.globalPermission = overrides.globalPermission ?? null;
  dto.fileId = overrides.fileId ?? null;
  return dto;
}

describe('SharedVfsService.resourceFilter', () => {
  it('uses virtual smart folder parents when building filtered paths', async () => {
    const smartFolder = createSharedResourceMeta({
      id: 'smart-folder-id',
      name: 'Smart folder',
      resourceType: ResourceType.SMART_FOLDER,
      hasChildren: true,
    });
    const matchedResource = createSharedResourceMeta({
      id: 'matched-doc-id',
      parentId: 'smart-folder-id',
      name: 'Matched doc',
      resourceType: ResourceType.DOC,
    });
    const sharedResourcesService = {
      getAndValidateResourceMeta: jest.fn().mockResolvedValue(smartFolder),
      getSharedResourceChildren: jest.fn(),
      resourceFilter: jest.fn().mockResolvedValue({
        resources: [matchedResource],
        total: 1,
      }),
      batchGetResourcePath: jest.fn(),
    };
    sharedResourcesService.batchGetResourcePath.mockResolvedValue(
      new Map([
        [
          'matched-doc-id',
          [
            createResourceMeta({
              id: 'smart-folder-id',
              name: 'Smart folder',
              resourceType: ResourceType.SMART_FOLDER,
            }),
            createResourceMeta({
              id: 'matched-doc-id',
              name: 'Matched doc',
              parentId: 'smart-folder-id',
            }),
          ],
        ],
      ]),
    );
    const service = new SharedVfsService(sharedResourcesService as any);

    const result = await service.resourceFilter(
      {
        id: 'share-id',
        namespaceId: 'namespace-id',
        resourceId: 'smart-folder-id',
        allResources: true,
      } as any,
      {
        path: '/share/Smart folder',
        options: { namePattern: 'Matched' },
      } as any,
    );

    expect(sharedResourcesService.batchGetResourcePath).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 'smart-folder-id' }),
      ['matched-doc-id'],
    );
    expect(result.total).toBe(1);
    expect(result.resources).toEqual([
      expect.objectContaining({
        id: 'matched-doc-id',
        parentId: 'smart-folder-id',
        name: 'Matched doc',
        path: '/share/Smart folder/Matched doc',
      }),
    ]);
  });

  it('keeps matched folder descendants under the virtual smart folder path', async () => {
    const smartFolder = createSharedResourceMeta({
      id: 'smart-folder-id',
      name: 'Smart folder',
      resourceType: ResourceType.SMART_FOLDER,
      hasChildren: true,
    });
    const matchedFolder = createSharedResourceMeta({
      id: 'matched-folder-id',
      parentId: 'smart-folder-id',
      name: 'Matched folder',
      resourceType: ResourceType.FOLDER,
      hasChildren: true,
    });
    const matchedDescendant = createSharedResourceMeta({
      id: 'matched-descendant-id',
      parentId: 'matched-folder-id',
      name: 'Nested doc',
      resourceType: ResourceType.DOC,
    });
    const sharedResourcesService = {
      getAndValidateResourceMeta: jest.fn().mockResolvedValue(smartFolder),
      getSharedResourceChildren: jest.fn().mockResolvedValue([matchedFolder]),
      resourceFilter: jest.fn().mockResolvedValue({
        resources: [matchedFolder, matchedDescendant],
        total: 2,
      }),
      batchGetResourcePath: jest.fn(),
    };
    sharedResourcesService.batchGetResourcePath.mockResolvedValue(
      new Map([
        [
          'matched-folder-id',
          [
            createResourceMeta({
              id: 'smart-folder-id',
              name: 'Smart folder',
              resourceType: ResourceType.SMART_FOLDER,
            }),
            createResourceMeta({
              id: 'matched-folder-id',
              name: 'Matched folder',
              parentId: 'smart-folder-id',
              resourceType: ResourceType.FOLDER,
            }),
          ],
        ],
        [
          'matched-descendant-id',
          [
            createResourceMeta({
              id: 'smart-folder-id',
              name: 'Smart folder',
              resourceType: ResourceType.SMART_FOLDER,
            }),
            createResourceMeta({
              id: 'matched-folder-id',
              name: 'Matched folder',
              parentId: 'smart-folder-id',
              resourceType: ResourceType.FOLDER,
            }),
            createResourceMeta({
              id: 'matched-descendant-id',
              name: 'Nested doc',
              parentId: 'matched-folder-id',
            }),
          ],
        ],
      ]),
    );
    const service = new SharedVfsService(sharedResourcesService as any);

    const result = await service.resourceFilter(
      {
        id: 'share-id',
        namespaceId: 'namespace-id',
        resourceId: 'smart-folder-id',
        allResources: true,
      } as any,
      {
        path: '/share/Smart folder',
        options: { namePattern: 'doc' },
      } as any,
    );

    expect(sharedResourcesService.batchGetResourcePath).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 'smart-folder-id' }),
      ['matched-folder-id', 'matched-descendant-id'],
    );
    expect(result.resources).toEqual([
      expect.objectContaining({
        id: 'matched-folder-id',
        parentId: 'smart-folder-id',
        path: '/share/Smart folder/Matched folder',
      }),
      expect.objectContaining({
        id: 'matched-descendant-id',
        parentId: 'matched-folder-id',
        path: '/share/Smart folder/Matched folder/Nested doc',
      }),
    ]);
  });
});
