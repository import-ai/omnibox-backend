import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { ResourceSummaryDto } from 'omniboxd/namespace-resources/dto/resource-summary.dto';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import {
  SmartFolderConfig,
  SmartFolderMatchMode,
  SmartFolderOwnerScope,
  SmartFolderRootScope,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import { ISmartFoldersService } from 'omniboxd/smart-folders/smart-folder-entitlements.interface';
import { SmartFoldersMatcherService } from 'omniboxd/smart-folders/smart-folders-matcher.service';
import { SmartFoldersQuotaService } from 'omniboxd/smart-folders/smart-folders-quota.service';
import { SmartFoldersRuleService } from 'omniboxd/smart-folders/smart-folders-rule.service';
import { SmartFoldersScopeService } from 'omniboxd/smart-folders/smart-folders-scope.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { transaction } from 'omniboxd/utils/transaction-utils';
import { I18nService } from 'nestjs-i18n';
import { DataSource, In, Repository } from 'typeorm';
import { CreateSmartFolderRequestDto } from './dto/create-smart-folder-request.dto';
import { SmartFolderResponseDto } from './dto/smart-folder-response.dto';
import { UpdateSmartFolderRequestDto } from './dto/update-smart-folder-request.dto';

@Injectable()
export class SmartFoldersService implements ISmartFoldersService {
  constructor(
    @InjectRepository(SmartFolderConfig)
    private readonly smartFolderConfigRepository: Repository<SmartFolderConfig>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly dataSource: DataSource,
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly permissionsService: PermissionsService,
    private readonly ruleService: SmartFoldersRuleService,
    private readonly scopeService: SmartFoldersScopeService,
    private readonly matcherService: SmartFoldersMatcherService,
    private readonly quotaService: SmartFoldersQuotaService,
    private readonly tagService: TagService,
    private readonly i18n: I18nService,
  ) {}

  async create(
    userId: string,
    namespaceId: string,
    dto: CreateSmartFolderRequestDto,
  ): Promise<SmartFolderResponseDto> {
    const conditions = this.ruleService.normalize(dto.conditions);

    const matchMode = dto.matchMode ?? SmartFolderMatchMode.ALL;
    const ownerScope = dto.ownerScope ?? SmartFolderOwnerScope.PRIVATE;
    const rootScope = dto.rootScope;
    this.assertValidScope(ownerScope, rootScope);
    const parentId = await this.scopeService.getOwnerRootId(
      userId,
      namespaceId,
      ownerScope,
    );

    const resource = await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;
      await this.quotaService.assertEntitlements(
        namespaceId,
        userId,
        ownerScope,
        conditions.length,
        manager,
      );
      const createdResource = await this.namespaceResourcesService.create(
        userId,
        namespaceId,
        {
          name: dto.name,
          parentId,
          resourceType: ResourceType.SMART_FOLDER,
          content: '',
          attrs: {},
        },
        tx,
      );

      await manager.save(
        SmartFolderConfig,
        manager.create(SmartFolderConfig, {
          resourceId: createdResource.id,
          namespaceId,
          ownerUserId: userId,
          ownerScope,
          rootScope,
          matchMode,
          conditions,
        }),
      );

      return createdResource;
    });

    return await this.get(userId, namespaceId, resource.id);
  }

  async list(
    userId: string,
    namespaceId: string,
    parentId?: string,
  ): Promise<SmartFolderResponseDto[]> {
    const queryBuilder = this.smartFolderConfigRepository
      .createQueryBuilder('config')
      .innerJoin('resources', 'resource', 'resource.id = config.resource_id')
      .where('config.namespace_id = :namespaceId', { namespaceId })
      .andWhere('resource.deleted_at IS NULL')
      .andWhere('resource.resource_type = :resourceType', {
        resourceType: ResourceType.SMART_FOLDER,
      });

    if (parentId) {
      queryBuilder.andWhere('resource.parent_id = :parentId', { parentId });
    }

    const configs = await queryBuilder
      .orderBy('resource.updated_at', 'DESC')
      .getMany();

    const items = await Promise.all(
      configs.map((config) => this.safeGet(userId, namespaceId, config)),
    );

    return items.filter(
      (item): item is SmartFolderResponseDto => item !== null,
    );
  }

  async get(
    userId: string,
    namespaceId: string,
    resourceId: string,
  ): Promise<SmartFolderResponseDto> {
    const config = await this.getConfigOrFail(namespaceId, resourceId);
    return await this.toDto(userId, namespaceId, config);
  }

  async listChildren(
    userId: string,
    namespaceId: string,
    resourceId: string,
    options?: {
      limit?: number;
      offset?: number;
    },
  ): Promise<ResourceSummaryDto[]> {
    const config = await this.getConfigOrFail(namespaceId, resourceId);
    await this.assertCanView(namespaceId, resourceId, userId);

    // Smart folders are virtual result sets.
    const visibleResources =
      await this.namespaceResourcesService.getUserVisibleResources(
        userId,
        namespaceId,
      );
    const scopedResourceIds =
      await this.scopeService.getScopedVisibleResourceIds(
        userId,
        namespaceId,
        config.rootScope,
        visibleResources,
      );
    const visibleIds = visibleResources
      .filter((resource) => scopedResourceIds.has(resource.id))
      .filter((resource) => resource.id !== resourceId)
      .filter((resource) => resource.resourceType !== ResourceType.SMART_FOLDER)
      .map((resource) => resource.id);

    if (visibleIds.length <= 0) {
      return [];
    }

    const resources = await this.resourceRepository.find({
      where: {
        namespaceId,
        id: In(visibleIds),
      },
    });
    const resourcesWithTagNames = await this.withTagNames(
      namespaceId,
      resources,
    );
    const visibleIdSet = new Set(visibleIds);
    const hasChildrenMap = new Map<string, boolean>();
    for (const resource of visibleResources) {
      if (resource.parentId && visibleIdSet.has(resource.parentId)) {
        hasChildrenMap.set(resource.parentId, true);
      }
    }

    const matched = resourcesWithTagNames
      .filter((resource) =>
        this.matcherService.matches(
          resource,
          config.conditions,
          config.matchMode,
        ),
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const offset = Math.max(0, options?.offset ?? 0);
    const limit =
      options?.limit === undefined
        ? undefined
        : Math.max(1, Math.min(100, options.limit));

    const paged =
      limit === undefined
        ? matched.slice(offset)
        : matched.slice(offset, offset + limit);

    return paged.map((resource) =>
      ResourceSummaryDto.fromEntity(
        resource,
        !!hasChildrenMap.get(resource.id),
      ),
    );
  }

  async isResourceMatched(
    userId: string,
    namespaceId: string,
    smartFolderId: string,
    resourceId: string,
  ): Promise<boolean> {
    if (smartFolderId === resourceId) {
      return false;
    }

    const config = await this.getConfigOrFail(namespaceId, smartFolderId);
    const resource = await this.resourceRepository.findOne({
      where: { namespaceId, id: resourceId },
    });
    if (!resource || resource.resourceType === ResourceType.SMART_FOLDER) {
      return false;
    }

    const allowed = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_VIEW,
    );
    if (!allowed) {
      return false;
    }

    const inScope = await this.scopeService.isResourceInScope(
      userId,
      namespaceId,
      config.rootScope,
      resourceId,
    );
    if (!inScope) {
      return false;
    }

    const [resourceWithTagNames] = await this.withTagNames(namespaceId, [
      resource,
    ]);
    return this.matcherService.matches(
      resourceWithTagNames,
      config.conditions,
      config.matchMode,
    );
  }

  async assertRestoreEntitlements(
    namespaceId: string,
    userId: string,
    resourceId: string,
  ): Promise<void> {
    const config = await this.smartFolderConfigRepository.findOne({
      where: { resourceId },
    });
    if (!config) {
      return;
    }

    await this.quotaService.assertRestoreEntitlements(
      namespaceId,
      userId,
      config.ownerScope || SmartFolderOwnerScope.PRIVATE,
    );
  }

  async update(
    userId: string,
    namespaceId: string,
    resourceId: string,
    dto: UpdateSmartFolderRequestDto,
  ): Promise<SmartFolderResponseDto> {
    const config = await this.getConfigOrFail(namespaceId, resourceId);
    await this.assertCanEdit(namespaceId, resourceId, userId);

    const conditions =
      dto.conditions === undefined
        ? config.conditions
        : this.ruleService.normalize(dto.conditions);
    const ownerScope = dto.ownerScope ?? config.ownerScope;
    const rootScope = dto.rootScope ?? config.rootScope;
    this.assertValidScope(ownerScope, rootScope);
    const ownerScopeChanged =
      dto.ownerScope !== undefined && dto.ownerScope !== config.ownerScope;
    if (!ownerScopeChanged) {
      await this.quotaService.assertRuleLimit(
        namespaceId,
        userId,
        conditions.length,
      );
    }

    await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;
      const resourceUpdates: { name?: string; parentId?: string } = {};

      if (ownerScopeChanged) {
        await this.quotaService.assertEntitlements(
          namespaceId,
          userId,
          ownerScope,
          conditions.length,
          manager,
        );
      }

      if (dto.name !== undefined) {
        resourceUpdates.name = dto.name;
      }

      if (
        dto.ownerScope !== undefined &&
        dto.ownerScope !== config.ownerScope
      ) {
        resourceUpdates.parentId = await this.scopeService.getOwnerRootId(
          userId,
          namespaceId,
          ownerScope,
        );
      }

      if (Object.keys(resourceUpdates).length > 0) {
        await this.namespaceResourcesService.update(
          namespaceId,
          userId,
          resourceId,
          resourceUpdates,
        );
      }

      await manager.update(
        SmartFolderConfig,
        { resourceId, namespaceId },
        {
          ownerScope,
          rootScope,
          matchMode: dto.matchMode ?? config.matchMode,
          conditions,
        },
      );
    });

    return await this.get(userId, namespaceId, resourceId);
  }

  async delete(
    userId: string,
    namespaceId: string,
    resourceId: string,
  ): Promise<void> {
    await this.getConfigOrFail(namespaceId, resourceId);
    await this.assertCanEdit(namespaceId, resourceId, userId);
    await this.namespaceResourcesService.delete(
      userId,
      namespaceId,
      resourceId,
    );
  }

  private assertValidScope(
    ownerScope: SmartFolderOwnerScope,
    rootScope: SmartFolderRootScope,
  ): void {
    if (
      ownerScope === SmartFolderOwnerScope.TEAMSPACE &&
      rootScope !== SmartFolderRootScope.TEAMSPACE
    ) {
      const message = this.i18n.t('resource.errors.smartFolderScopeInvalid');
      throw new AppException(
        message,
        'SMART_FOLDER_SCOPE_INVALID',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private async getConfigOrFail(
    namespaceId: string,
    resourceId: string,
  ): Promise<SmartFolderConfig> {
    const config = await this.smartFolderConfigRepository
      .createQueryBuilder('config')
      .innerJoin('resources', 'resource', 'resource.id = config.resource_id')
      .where('config.namespace_id = :namespaceId', { namespaceId })
      .andWhere('config.resource_id = :resourceId', { resourceId })
      .andWhere('resource.deleted_at IS NULL')
      .andWhere('resource.resource_type = :resourceType', {
        resourceType: ResourceType.SMART_FOLDER,
      })
      .getOne();

    if (!config) {
      const message = this.i18n.t('resource.errors.smartFolderNotFound');
      throw new AppException(
        message,
        'SMART_FOLDER_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    return config;
  }

  private async assertCanEdit(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ): Promise<void> {
    const allowed = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT,
    );
    if (!allowed) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }
  }

  private async assertCanView(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ): Promise<void> {
    const allowed = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_VIEW,
    );
    if (!allowed) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }
  }

  private async withTagNames(
    namespaceId: string,
    resources: Resource[],
  ): Promise<Resource[]> {
    const tagIds = Array.from(
      new Set(resources.flatMap((resource) => resource.tagIds || [])),
    );
    if (tagIds.length <= 0) {
      return resources;
    }

    const tags = await this.tagService.getTagsByIds(namespaceId, tagIds);
    const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
    return resources.map((resource) => {
      const resourceTags = (resource.tagIds || [])
        .map((tagId) => tagsById.get(tagId))
        .filter((tag) => tag !== undefined);
      return {
        ...resource,
        attrs: {
          ...resource.attrs,
          tags: resourceTags,
        },
      } as Resource;
    });
  }

  private async safeGet(
    userId: string,
    namespaceId: string,
    config: SmartFolderConfig,
  ): Promise<SmartFolderResponseDto | null> {
    try {
      return await this.toDto(userId, namespaceId, config);
    } catch {
      return null;
    }
  }

  private async toDto(
    userId: string,
    namespaceId: string,
    config: SmartFolderConfig,
  ): Promise<SmartFolderResponseDto> {
    const resource = await this.namespaceResourcesService.getResource({
      userId,
      namespaceId,
      resourceId: config.resourceId,
    });
    return SmartFolderResponseDto.fromData({
      resource,
      config,
    });
  }
}
