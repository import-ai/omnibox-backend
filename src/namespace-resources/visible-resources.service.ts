import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { ResourceType } from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import {
  ISmartFoldersService,
  SMART_FOLDERS_SERVICE,
} from 'omniboxd/smart-folders/smart-folder-entitlements.interface';
import { PrivateSearchResourceDto } from 'omniboxd/wizard/dto/agent-request.dto';

export function toPrivateSearchResource(resource: {
  id: string;
  name: string;
  resourceType: ResourceType;
}): PrivateSearchResourceDto {
  return {
    id: resource.id,
    name: resource.name || '',
    type: toPrivateSearchResourceType(resource.resourceType),
  };
}

export function toPrivateSearchResourceType(
  resourceType: ResourceType,
): PrivateSearchResourceDto['type'] {
  if (
    resourceType === ResourceType.FOLDER ||
    resourceType === ResourceType.SMART_FOLDER ||
    // An rss folder is a container like any other: attached as chat context
    // it expands to the articles filed under it.
    resourceType === ResourceType.RSS_FOLDER
  ) {
    return 'folder';
  }
  return 'resource';
}

@Injectable()
export class VisibleResourcesService {
  constructor(
    private readonly configService: ConfigService,
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly resourcesService: ResourcesService,
    @Inject(SMART_FOLDERS_SERVICE)
    private readonly smartFoldersService: ISmartFoldersService,
  ) {}

  async getVisibleResources(
    namespaceId: string,
    userId: string,
    resources: PrivateSearchResourceDto[],
  ): Promise<PrivateSearchResourceDto[]> {
    // for private_search, pass the resource with permission
    if (resources.length === 0) {
      // Default true keeps old wizard ACL-safe. Set false after wizard
      // post-filters hits through POST /resources/visible.
      const expandEmpty =
        (
          this.configService.get<string>(
            'OBB_ASK_EXPAND_EMPTY_VISIBLE_RESOURCES',
          ) ?? 'true'
        ).toLowerCase() !== 'false';
      if (!expandEmpty) {
        return [];
      }
      const allResources =
        await this.namespaceResourcesService.getAllResourcesByUser(
          userId,
          namespaceId,
        );
      return allResources.map((r) => toPrivateSearchResource(r));
    }
    const visibleResources: PrivateSearchResourceDto[] =
      await this.namespaceResourcesService.permissionFilter<PrivateSearchResourceDto>(
        namespaceId,
        userId,
        resources,
      );
    for (const resource of resources) {
      if (resource.type === 'folder') {
        const meta = await this.resourcesService.getResourceMeta(
          namespaceId,
          resource.id,
        );
        if (meta?.resourceType === ResourceType.SMART_FOLDER) {
          // Smart folders are virtual — expand via conditions, not parentId
          const children = await this.smartFoldersService.listChildren(
            userId,
            namespaceId,
            resource.id,
          );
          resource.child_ids = children.map((r) => r.id);
          visibleResources.push(
            ...children.map((r) => toPrivateSearchResource(r)),
          );
        } else {
          const subResources =
            await this.namespaceResourcesService.getAllSubResourcesByUser(
              userId,
              namespaceId,
              resource.id,
            );
          resource.child_ids = subResources.map((r) => r.id);
          visibleResources.push(
            ...subResources.map((r) => toPrivateSearchResource(r)),
          );
        }
      }
    }
    return visibleResources;
  }
}
