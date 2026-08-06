import { HttpStatus, Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { Namespace } from 'omniboxd/namespaces/entities/namespace.entity';
import { NamespaceMember } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import {
  applyPartialManualOrder,
  ResourceSortBy,
  sortResources,
} from 'omniboxd/resources/resource-sort';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { transaction } from 'omniboxd/utils/transaction-utils';
import { DataSource, EntityManager } from 'typeorm';

import {
  InitializeManualSortRequestDto,
  ParentResourceOrderDto,
  UpdateManualSortRequestDto,
} from './dto/manual-resource-sort.dto';

@Injectable()
export class ResourceSortingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly permissionsService: PermissionsService,
    private readonly resourcesService: ResourcesService,
    private readonly i18n: I18nService,
  ) {}

  private invalidManualSort(messageKey: string, code: string): AppException {
    return new AppException(
      this.i18n.t(messageKey),
      code,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  private async getEditableRoot(
    userId: string,
    namespaceId: string,
    rootResourceId: string,
    entityManager: EntityManager,
  ): Promise<Resource> {
    const root = await entityManager.findOne(Resource, {
      where: { namespaceId, id: rootResourceId },
      lock: { mode: 'pessimistic_write' },
    });
    const isRegisteredRoot =
      (await entityManager.count(Namespace, {
        where: { id: namespaceId, rootResourceId },
      })) > 0 ||
      (await entityManager.count(NamespaceMember, {
        where: { namespaceId, rootResourceId },
      })) > 0;
    if (
      !root ||
      root.parentId !== null ||
      root.resourceType !== ResourceType.FOLDER ||
      !isRegisteredRoot
    ) {
      throw this.invalidManualSort(
        'resource.errors.invalidManualSortRoot',
        'INVALID_MANUAL_SORT_ROOT',
      );
    }
    const canEdit = await this.permissionsService.userHasPermission(
      namespaceId,
      rootResourceId,
      userId,
      ResourcePermission.CAN_EDIT,
      undefined,
      entityManager,
    );
    if (!canEdit) {
      throw new AppException(
        this.i18n.t('auth.errors.notAuthorized'),
        'NOT_AUTHORIZED',
        HttpStatus.FORBIDDEN,
      );
    }
    return root;
  }

  private async writeIndexes(
    entityManager: EntityManager,
    namespaceId: string,
    resources: Resource[],
  ): Promise<void> {
    const chunkSize = 500;
    for (let offset = 0; offset < resources.length; offset += chunkSize) {
      const chunk = resources.slice(offset, offset + chunkSize);
      const values: string[] = [];
      const parameters: string[] = [];
      for (const resource of chunk) {
        const idParameter = parameters.push(resource.id);
        const indexParameter = parameters.push(resource.manualSortIndex!);
        values.push(`($${idParameter}::varchar, $${indexParameter}::bigint)`);
      }
      const namespaceParameter = parameters.push(namespaceId);
      await entityManager.query(
        `UPDATE resources AS resource
         SET manual_sort_index = sorted.manual_sort_index,
             manual_sort_unspecified_at = NULL
         FROM (VALUES ${values.join(', ')}) AS sorted(id, manual_sort_index)
         WHERE resource.namespace_id = $${namespaceParameter}
           AND resource.id = sorted.id`,
        parameters,
      );
    }
  }

  async initialize(
    userId: string,
    namespaceId: string,
    rootResourceId: string,
    request: InitializeManualSortRequestDto,
  ): Promise<{ initializedAt: Date; overwritten: boolean }> {
    if (request.sortBy === ResourceSortBy.MANUAL) {
      throw this.invalidManualSort(
        'resource.errors.invalidManualSortSource',
        'INVALID_MANUAL_SORT_SOURCE',
      );
    }
    return await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;
      const root = await this.getEditableRoot(
        userId,
        namespaceId,
        rootResourceId,
        manager,
      );
      if (root.manualSortInitializedAt && !request.overwrite) {
        return {
          initializedAt: root.manualSortInitializedAt,
          overwritten: false,
        };
      }

      const allResources = await manager.find(Resource, {
        where: { namespaceId },
        lock: { mode: 'pessimistic_write' },
      });
      const childrenByParent = new Map<string, Resource[]>();
      for (const resource of allResources) {
        if (!resource.parentId) {
          continue;
        }
        const children = childrenByParent.get(resource.parentId) ?? [];
        children.push(resource);
        childrenByParent.set(resource.parentId, children);
      }

      const sortedResources: Resource[] = [];
      const parentIds = [rootResourceId];
      for (let index = 0; index < parentIds.length; index++) {
        const parentId = parentIds[index];
        const children = sortResources(childrenByParent.get(parentId) ?? [], {
          sortBy: request.sortBy,
          sortOrder: request.sortOrder,
        });
        children.forEach((resource, resourceIndex) => {
          resource.manualSortIndex = String(resourceIndex + 1);
          sortedResources.push(resource);
          parentIds.push(resource.id);
        });
      }

      await this.writeIndexes(manager, namespaceId, sortedResources);
      const initializedAt = new Date();
      await manager.query(
        `UPDATE resources
         SET manual_sort_initialized_at = $1
         WHERE namespace_id = $2 AND id = $3`,
        [initializedAt, namespaceId, rootResourceId],
      );
      return {
        initializedAt,
        overwritten: root.manualSortInitializedAt !== null,
      };
    });
  }

  private async validateParentOrder(
    userId: string,
    namespaceId: string,
    rootResourceId: string,
    order: ParentResourceOrderDto,
    entityManager: EntityManager,
  ): Promise<Resource[]> {
    const parents = await this.resourcesService.getParentResourcesOrFail(
      namespaceId,
      order.parentId,
      entityManager,
    );
    if (parents.at(-1)?.id !== rootResourceId) {
      throw this.invalidManualSort(
        'resource.errors.invalidManualSortOrder',
        'INVALID_MANUAL_SORT_ORDER',
      );
    }
    const canEdit = await this.permissionsService.userHasPermission(
      namespaceId,
      order.parentId,
      userId,
      ResourcePermission.CAN_EDIT,
      undefined,
      entityManager,
    );
    if (!canEdit) {
      throw new AppException(
        this.i18n.t('auth.errors.notAuthorized'),
        'NOT_AUTHORIZED',
        HttpStatus.FORBIDDEN,
      );
    }

    const children = await entityManager.find(Resource, {
      where: { namespaceId, parentId: order.parentId },
      lock: { mode: 'pessimistic_write' },
    });
    const childrenById = new Map(
      children.map((resource) => [resource.id, resource]),
    );
    if (order.resourceIds.some((resourceId) => !childrenById.has(resourceId))) {
      throw this.invalidManualSort(
        'resource.errors.invalidManualSortOrder',
        'INVALID_MANUAL_SORT_ORDER',
      );
    }
    const resourcesWithParents =
      await this.resourcesService.batchGetParentResources(
        namespaceId,
        order.resourceIds,
        entityManager,
      );
    const visibleResources =
      await this.permissionsService.filterResourcesByPermission(
        userId,
        namespaceId,
        [...resourcesWithParents.values()],
        ResourcePermission.CAN_VIEW,
        entityManager,
      );
    const visibleResourceIds = new Set(
      visibleResources.map((resource) => resource.id),
    );
    if (
      order.resourceIds.some(
        (resourceId) => !visibleResourceIds.has(resourceId),
      )
    ) {
      throw this.invalidManualSort(
        'resource.errors.invalidManualSortOrder',
        'INVALID_MANUAL_SORT_ORDER',
      );
    }
    return applyPartialManualOrder(children, order.resourceIds);
  }

  async update(
    userId: string,
    namespaceId: string,
    request: UpdateManualSortRequestDto,
  ): Promise<void> {
    const hasMove = request.resourceId !== undefined;
    if (hasMove !== (request.targetParentId !== undefined)) {
      throw this.invalidManualSort(
        'resource.errors.invalidManualSortOrder',
        'INVALID_MANUAL_SORT_ORDER',
      );
    }
    const parentIds = request.orders.map((order) => order.parentId);
    if (new Set(parentIds).size !== parentIds.length) {
      throw this.invalidManualSort(
        'resource.errors.invalidManualSortOrder',
        'INVALID_MANUAL_SORT_ORDER',
      );
    }

    await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;
      const root = await this.getEditableRoot(
        userId,
        namespaceId,
        request.rootResourceId,
        manager,
      );
      if (!root.manualSortInitializedAt) {
        throw this.invalidManualSort(
          'resource.errors.manualSortNotInitialized',
          'MANUAL_SORT_NOT_INITIALIZED',
        );
      }

      if (request.resourceId && request.targetParentId) {
        const movingResource = await manager.findOne(Resource, {
          where: { namespaceId, id: request.resourceId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!movingResource?.parentId) {
          throw this.invalidManualSort(
            'resource.errors.invalidManualSortOrder',
            'INVALID_MANUAL_SORT_ORDER',
          );
        }
        const requiredParentIds = new Set([
          movingResource.parentId,
          request.targetParentId,
        ]);
        if (
          [...requiredParentIds].some(
            (parentId) => !parentIds.includes(parentId),
          )
        ) {
          throw this.invalidManualSort(
            'resource.errors.invalidManualSortOrder',
            'INVALID_MANUAL_SORT_ORDER',
          );
        }
        const canEditResource = await this.permissionsService.userHasPermission(
          namespaceId,
          request.resourceId,
          userId,
          ResourcePermission.CAN_EDIT,
          undefined,
          manager,
        );
        if (!canEditResource) {
          throw new AppException(
            this.i18n.t('auth.errors.notAuthorized'),
            'NOT_AUTHORIZED',
            HttpStatus.FORBIDDEN,
          );
        }
        await this.resourcesService.updateResource(
          namespaceId,
          request.resourceId,
          userId,
          { parentId: request.targetParentId },
          tx,
        );
      }

      for (const order of request.orders) {
        const resources = await this.validateParentOrder(
          userId,
          namespaceId,
          request.rootResourceId,
          order,
          manager,
        );
        await this.writeIndexes(manager, namespaceId, resources);
      }
    });
  }
}
