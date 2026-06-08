import { Injectable } from '@nestjs/common';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import {
  SmartFolderOwnerScope,
  SmartFolderRootScope,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import { SmartFolderResourcesService } from 'omniboxd/smart-folders/smart-folder-resources.service';

@Injectable()
export class SmartFoldersScopeService {
  constructor(
    private readonly smartFolderResourcesService: SmartFolderResourcesService,
    private readonly resourcesService: ResourcesService,
  ) {}

  async getScopedVisibleResourceIds(
    userId: string,
    namespaceId: string,
    rootScope: SmartFolderRootScope,
    visibleResources: Array<{ id: string }>,
  ): Promise<Set<string>> {
    const scopes: Array<
      SmartFolderRootScope.PRIVATE | SmartFolderRootScope.TEAMSPACE
    > =
      rootScope === SmartFolderRootScope.ALL
        ? [SmartFolderRootScope.PRIVATE, SmartFolderRootScope.TEAMSPACE]
        : [rootScope];
    const scopedVisibleResourceIds = new Set<string>();

    for (const scope of scopes) {
      const rootResourceId = await this.getOwnerRootId(
        userId,
        namespaceId,
        scope,
      );
      const scopedResources = await this.resourcesService.getAllSubResources(
        namespaceId,
        [rootResourceId],
      );
      const visibleResourceIdSet = new Set(
        visibleResources.map((resource) => resource.id),
      );
      scopedVisibleResourceIds.add(rootResourceId);

      for (const resource of scopedResources) {
        if (visibleResourceIdSet.has(resource.id)) {
          scopedVisibleResourceIds.add(resource.id);
        }
      }
    }

    return scopedVisibleResourceIds;
  }

  async isResourceInScope(
    userId: string,
    namespaceId: string,
    rootScope: SmartFolderRootScope,
    resourceId: string,
  ): Promise<boolean> {
    const parentResources =
      await this.resourcesService.getParentResourcesOrFail(
        namespaceId,
        resourceId,
      );
    const resourceIds = parentResources.map((resource) => resource.id);
    const scopes: Array<
      SmartFolderRootScope.PRIVATE | SmartFolderRootScope.TEAMSPACE
    > =
      rootScope === SmartFolderRootScope.ALL
        ? [SmartFolderRootScope.PRIVATE, SmartFolderRootScope.TEAMSPACE]
        : [rootScope];

    for (const scope of scopes) {
      const rootResourceId = await this.getOwnerRootId(
        userId,
        namespaceId,
        scope,
      );
      if (resourceIds.includes(rootResourceId)) {
        return true;
      }
    }

    return false;
  }

  async getOwnerRootId(
    userId: string,
    namespaceId: string,
    scope:
      | SmartFolderOwnerScope
      | SmartFolderRootScope.PRIVATE
      | SmartFolderRootScope.TEAMSPACE,
  ): Promise<string> {
    return scope === SmartFolderOwnerScope.PRIVATE
      ? await this.smartFolderResourcesService.getPrivateRootId(
          userId,
          namespaceId,
        )
      : (await this.smartFolderResourcesService.getTeamspaceRoot(namespaceId))
          .id;
  }
}
