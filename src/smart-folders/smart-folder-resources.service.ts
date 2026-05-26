import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { Namespace } from 'omniboxd/namespaces/entities/namespace.entity';
import { NamespaceMember } from 'omniboxd/namespaces/entities/namespace-member.entity';
import {
  ResourceDto,
  SpaceType,
} from 'omniboxd/namespace-resources/dto/resource.dto';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { Transaction, transaction } from 'omniboxd/utils/transaction-utils';
import { I18nService } from 'nestjs-i18n';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  SmartFolderCreateResourceInput,
  SmartFolderUpdateResourceInput,
} from './types/smart-folder-resource.types';

@Injectable()
export class SmartFolderResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(Namespace)
    private readonly namespaceRepository: Repository<Namespace>,
    @InjectRepository(NamespaceMember)
    private readonly namespaceMemberRepository: Repository<NamespaceMember>,
    private readonly dataSource: DataSource,
    private readonly resourcesService: ResourcesService,
    private readonly permissionsService: PermissionsService,
    private readonly tagService: TagService,
    private readonly i18n: I18nService,
  ) {}

  async create(
    userId: string,
    namespaceId: string,
    createReq: SmartFolderCreateResourceInput,
    tx?: Transaction,
  ): Promise<Resource> {
    if (!tx) {
      return await transaction(this.dataSource.manager, async (tx) => {
        return await this.create(userId, namespaceId, createReq, tx);
      });
    }

    const canEditParent = await this.permissionsService.userHasPermission(
      namespaceId,
      createReq.parentId,
      userId,
      ResourcePermission.CAN_EDIT,
      undefined,
      tx.entityManager,
    );
    if (!canEditParent) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }

    return await this.resourcesService.createResource(
      {
        ...createReq,
        namespaceId,
        userId,
        attrs: { ...createReq.attrs },
        tagIds: createReq.tag_ids,
      },
      tx,
    );
  }

  async update(
    namespaceId: string,
    userId: string,
    resourceId: string,
    data: SmartFolderUpdateResourceInput,
  ) {
    await this.resourcesService.updateResource(
      namespaceId,
      resourceId,
      userId,
      {
        name: data.name,
        parentId: data.parentId,
        tagIds: data.tag_ids,
        content: data.content,
        attrs: data.attrs,
      },
    );
  }

  async delete(userId: string, namespaceId: string, resourceId: string) {
    const resource = await this.resourcesService.getResourceOrFail(
      namespaceId,
      resourceId,
    );
    if (!resource.parentId) {
      const message = this.i18n.t('resource.errors.cannotDeleteRoot');
      throw new AppException(
        message,
        'CANNOT_DELETE_ROOT',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.resourcesService.deleteResource(userId, namespaceId, resourceId);
  }

  async getResource({
    userId,
    namespaceId,
    resourceId,
  }: {
    userId: string;
    namespaceId: string;
    resourceId: string;
  }): Promise<ResourceDto> {
    const resource = await this.resourcesService.getResourceOrFail(
      namespaceId,
      resourceId,
    );
    if (!resource.parentId) {
      const message = this.i18n.t('resource.errors.resourceNotFound');
      throw new AppException(
        message,
        'RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    const parentResources =
      await this.resourcesService.getParentResourcesOrFail(
        namespaceId,
        resource.parentId,
      );
    const rootResourceId = parentResources[parentResources.length - 1].id;
    const spaceType = await this.getSpaceType(namespaceId, rootResourceId);
    const resourceMeta = ResourceMetaDto.fromEntity(resource);
    const curPermission = await this.permissionsService.getCurrentPermission(
      namespaceId,
      [resourceMeta, ...parentResources],
      userId,
    );

    if (curPermission === ResourcePermission.NO_ACCESS) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }

    const tagsMap = await this.getTagsForResources(namespaceId, [resource]);
    const path = [resourceMeta, ...parentResources]
      .reverse()
      .map((resource) => ({ id: resource.id, name: resource.name }));
    return ResourceDto.fromEntity(
      resource,
      curPermission,
      path,
      spaceType,
      tagsMap.get(resource.id) || [],
    );
  }

  async getUserVisibleResources(
    userId: string,
    namespaceId: string,
  ): Promise<ResourceMetaDto[]> {
    const allResources =
      await this.resourcesService.getAllResources(namespaceId);
    const resources = await this.permissionsService.filterResourcesByPermission(
      userId,
      namespaceId,
      allResources,
    );
    return resources.filter((resource) => resource.parentId !== null);
  }

  async getPrivateRootId(
    userId: string,
    namespaceId: string,
    manager?: EntityManager,
  ): Promise<string> {
    const repo = manager
      ? manager.getRepository(NamespaceMember)
      : this.namespaceMemberRepository;
    const member = await repo.findOne({
      where: {
        userId,
        namespaceId,
      },
    });
    if (!member) {
      const message = this.i18n.t('namespace.errors.rootResourceNotFound');
      throw new AppException(
        message,
        'ROOT_RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return member.rootResourceId;
  }

  async getTeamspaceRoot(
    namespaceId: string,
    manager?: EntityManager,
  ): Promise<ResourceMetaDto> {
    const repo = manager
      ? manager.getRepository(Namespace)
      : this.namespaceRepository;
    const namespace = await repo.findOne({
      where: {
        id: namespaceId,
      },
    });
    if (!namespace) {
      const message = this.i18n.t('namespace.errors.workspaceNotFound');
      throw new AppException(
        message,
        'WORKSPACE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!namespace.rootResourceId) {
      const message = this.i18n.t('namespace.errors.rootResourceNotFound');
      throw new AppException(
        message,
        'ROOT_RESOURCE_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return await this.resourcesService.getResourceMetaOrFail(
      namespaceId,
      namespace.rootResourceId,
      manager,
    );
  }

  private async getSpaceType(
    namespaceId: string,
    rootResourceId: string,
  ): Promise<SpaceType> {
    const count = await this.namespaceRepository.count({
      where: {
        id: namespaceId,
        rootResourceId,
      },
    });
    return count > 0 ? SpaceType.TEAM : SpaceType.PRIVATE;
  }

  private async getTagsForResources(
    namespaceId: string,
    resources: Resource[],
  ) {
    const allTagIds = new Set<string>();
    resources.forEach((resource) => {
      resource.tagIds?.forEach((tagId) => allTagIds.add(tagId));
    });

    const tags = await this.tagService.getTagsByIds(
      namespaceId,
      Array.from(allTagIds),
    );
    const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
    const resourceTagsMap = new Map<string, typeof tags>();

    resources.forEach((resource) => {
      const resourceTags =
        resource.tagIds
          ?.map((tagId) => tagsById.get(tagId))
          .filter((tag) => tag !== undefined) || [];
      resourceTagsMap.set(resource.id, resourceTags);
    });

    return resourceTagsMap;
  }
}
