import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';

import { NamespaceResourcesService } from './namespace-resources.service';

describe('NamespaceResourcesService.listTrash', () => {
  const permissionsService = {
    userInNamespace: jest.fn().mockResolvedValue(true),
    getCurrentPermissions: jest.fn(),
  };
  const resourcesService = {
    getDeletedResources: jest.fn(),
    batchGetParentResources: jest.fn(),
  };
  const namespacesQuotaService = {
    getNamespaceUsage: jest.fn().mockResolvedValue({ trashRetentionDays: 7 }),
  };
  const i18n = { t: jest.fn().mockReturnValue('not authorized') };
  const service = new NamespaceResourcesService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    permissionsService as unknown as PermissionsService,
    {} as never,
    {} as never,
    {} as never,
    resourcesService as unknown as ResourcesService,
    {} as never,
    i18n as unknown as I18nService,
    namespacesQuotaService as unknown as NamespacesQuotaService,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  function deleted(id: string): Resource {
    return {
      id,
      parentId: 'parent',
      name: id,
      resourceType: ResourceType.DOC,
      attrs: {},
      content: '',
      createdAt: new Date('2026-10-21T00:00:00.000Z'),
      updatedAt: new Date('2026-10-21T00:00:00.000Z'),
      deletedAt: new Date('2026-10-21T01:00:00.000Z'),
    } as Resource;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    permissionsService.userInNamespace.mockResolvedValue(true);
    namespacesQuotaService.getNamespaceUsage.mockResolvedValue({
      trashRetentionDays: 7,
    });
    resourcesService.batchGetParentResources.mockImplementation(
      (_namespaceId: string, ids: string[]) =>
        new Map(ids.map((id) => [id, { id }])),
    );
  });

  it('pages the editable rows and ignores the unfiltered count', async () => {
    const items = Array.from({ length: 25 }, (_, index) =>
      deleted(`resource-${index}`),
    );
    resourcesService.getDeletedResources.mockResolvedValue({
      items,
      total: 100,
    });
    const hidden = (id: string) =>
      id === 'resource-2' || id === 'resource-11' || id === 'resource-23';
    permissionsService.getCurrentPermissions.mockResolvedValue(
      new Map(
        items.map((item) => [
          item.id,
          hidden(item.id)
            ? ResourcePermission.CAN_VIEW
            : ResourcePermission.CAN_EDIT,
        ]),
      ),
    );

    const first = await service.listTrash('namespace', 'user', {
      limit: 20,
      offset: 0,
    });
    const second = await service.listTrash('namespace', 'user', {
      limit: 20,
      offset: 20,
    });

    const visible = items.map((item) => item.id).filter((id) => !hidden(id));
    expect(resourcesService.getDeletedResources).toHaveBeenCalledWith(
      'namespace',
      7,
      { search: undefined },
    );
    expect(first.total).toBe(visible.length);
    expect(second.total).toBe(visible.length);
    expect(first.items.map((item) => item.id)).toEqual(visible.slice(0, 20));
    expect(second.items.map((item) => item.id)).toEqual(visible.slice(20));
    expect(first.trashRetentionDays).toBe(7);
  });

  it('rejects a user who is outside the namespace', async () => {
    permissionsService.userInNamespace.mockResolvedValue(false);

    await expect(service.listTrash('namespace', 'user')).rejects.toBeInstanceOf(
      AppException,
    );
    expect(resourcesService.getDeletedResources).not.toHaveBeenCalled();
  });
});
