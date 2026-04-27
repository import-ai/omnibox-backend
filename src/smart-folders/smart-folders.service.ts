import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { ResourceSummaryDto } from 'omniboxd/namespace-resources/dto/resource-summary.dto';
import { NamespaceResourcesService } from 'omniboxd/namespace-resources/namespace-resources.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import {
  SmartFolderCondition,
  SmartFolderField,
  SmartFolderConfig,
  SmartFolderMatchMode,
  SmartFolderOperator,
  SmartFolderRootScope,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import {
  ISmartFolderEntitlementsProvider,
  SMART_FOLDER_ENTITLEMENTS_PROVIDER,
} from 'omniboxd/smart-folders/smart-folder-entitlements.interface';
import { SmartFoldersRuleService } from 'omniboxd/smart-folders/smart-folders-rule.service';
import { transaction } from 'omniboxd/utils/transaction-utils';
import { DataSource, In, Repository } from 'typeorm';
import { CreateSmartFolderRequestDto } from './dto/create-smart-folder-request.dto';
import { SmartFolderResponseDto } from './dto/smart-folder-response.dto';
import { UpdateSmartFolderRequestDto } from './dto/update-smart-folder-request.dto';

@Injectable()
export class SmartFoldersService {
  constructor(
    @InjectRepository(SmartFolderConfig)
    private readonly smartFolderConfigRepository: Repository<SmartFolderConfig>,
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly dataSource: DataSource,
    private readonly namespaceResourcesService: NamespaceResourcesService,
    private readonly namespacesService: NamespacesService,
    private readonly permissionsService: PermissionsService,
    private readonly resourcesService: ResourcesService,
    private readonly ruleService: SmartFoldersRuleService,
    @Inject(SMART_FOLDER_ENTITLEMENTS_PROVIDER)
    private readonly entitlementsProvider: ISmartFolderEntitlementsProvider,
  ) {}

  async create(
    userId: string,
    namespaceId: string,
    dto: CreateSmartFolderRequestDto,
  ): Promise<SmartFolderResponseDto> {
    const conditions = this.ruleService.normalize(dto.conditions);
    const matchMode = dto.matchMode ?? SmartFolderMatchMode.ALL;
    await this.assertEntitlements(
      namespaceId,
      userId,
      dto.rootScope,
      conditions.length,
    );

    const resource = await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;
      const createdResource = await this.namespaceResourcesService.create(
        userId,
        namespaceId,
        {
          name: dto.name,
          parentId: dto.parentId,
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
          rootScope: dto.rootScope,
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
    const scopedResourceIds = await this.getScopedVisibleResourceIds(
      userId,
      namespaceId,
      config.rootScope,
      visibleResources.map((resource) => resource.id),
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
    const visibleIdSet = new Set(visibleIds);
    const hasChildrenMap = new Map<string, boolean>();
    for (const resource of visibleResources) {
      if (resource.parentId && visibleIdSet.has(resource.parentId)) {
        hasChildrenMap.set(resource.parentId, true);
      }
    }

    const matched = resources
      .filter((resource) =>
        this.matches(resource, config.conditions, config.matchMode),
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

  private async getScopedVisibleResourceIds(
    userId: string,
    namespaceId: string,
    rootScope: SmartFolderRootScope,
    visibleResourceIds: string[],
  ): Promise<Set<string>> {
    const rootResourceId =
      rootScope === SmartFolderRootScope.PRIVATE
        ? await this.namespacesService.getPrivateRootId(userId, namespaceId)
        : (await this.namespacesService.getTeamspaceRoot(namespaceId)).id;
    const scopedResources = await this.resourcesService.getAllSubResources(
      namespaceId,
      [rootResourceId],
    );

    const scopedVisibleResourceIds = new Set<string>([rootResourceId]);
    const visibleResourceIdSet = new Set(visibleResourceIds);

    for (const resource of scopedResources) {
      if (visibleResourceIdSet.has(resource.id)) {
        scopedVisibleResourceIds.add(resource.id);
      }
    }

    return scopedVisibleResourceIds;
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
    await this.assertRuleLimit(namespaceId, userId, conditions.length);

    await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;
      if (dto.name !== undefined) {
        await this.namespaceResourcesService.update(
          namespaceId,
          userId,
          resourceId,
          { name: dto.name },
        );
      }

      await manager.update(
        SmartFolderConfig,
        { resourceId, namespaceId },
        {
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

  private async assertEntitlements(
    namespaceId: string,
    userId: string,
    rootScope: SmartFolderRootScope,
    ruleCount: number,
  ): Promise<void> {
    const entitlements = await this.entitlementsProvider.getEntitlements(
      namespaceId,
      userId,
    );
    if (ruleCount > entitlements.ruleLimit) {
      throw new AppException(
        'Smart folder rule limit exceeded',
        'SMART_FOLDER_RULE_LIMIT_EXCEEDED',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const limit =
      rootScope === SmartFolderRootScope.PRIVATE
        ? entitlements.privateLimit
        : entitlements.teamLimit;
    // A negative limit is treated as unlimited.
    if (limit < 0) {
      return;
    }

    const count = await this.countActive(namespaceId, userId, rootScope);
    if (count >= limit) {
      throw new AppException(
        'Smart folder quota exceeded',
        'SMART_FOLDER_QUOTA_EXCEEDED',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private async assertRuleLimit(
    namespaceId: string,
    userId: string,
    ruleCount: number,
  ): Promise<void> {
    const entitlements = await this.entitlementsProvider.getEntitlements(
      namespaceId,
      userId,
    );
    if (ruleCount > entitlements.ruleLimit) {
      throw new AppException(
        'Smart folder rule limit exceeded',
        'SMART_FOLDER_RULE_LIMIT_EXCEEDED',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private async countActive(
    namespaceId: string,
    userId: string,
    rootScope: SmartFolderRootScope,
  ): Promise<number> {
    const queryBuilder = this.smartFolderConfigRepository
      .createQueryBuilder('config')
      .innerJoin('resources', 'resource', 'resource.id = config.resource_id')
      .where('config.namespace_id = :namespaceId', { namespaceId })
      .andWhere('config.root_scope = :rootScope', { rootScope })
      .andWhere('resource.deleted_at IS NULL');

    if (rootScope === SmartFolderRootScope.PRIVATE) {
      queryBuilder.andWhere('config.owner_user_id = :userId', { userId });
    }

    return await queryBuilder.getCount();
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
      throw new AppException(
        'Smart folder not found',
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
      throw new AppException(
        'Not authorized',
        'NOT_AUTHORIZED',
        HttpStatus.FORBIDDEN,
      );
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
      throw new AppException(
        'Not authorized',
        'NOT_AUTHORIZED',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private matches(
    resource: Resource,
    conditions: SmartFolderCondition[],
    matchMode: SmartFolderMatchMode,
  ): boolean {
    if (conditions.length <= 0) {
      return false;
    }
    const matcher = (condition: SmartFolderCondition) =>
      this.matchesCondition(resource, condition);
    return matchMode === SmartFolderMatchMode.ANY
      ? conditions.some(matcher)
      : conditions.every(matcher);
  }

  private matchesCondition(
    resource: Resource,
    condition: SmartFolderCondition,
  ): boolean {
    const operator = condition.operator;
    const candidate = this.getConditionCandidate(resource, condition.field);
    const expected = this.getConditionTextValue(condition);

    switch (operator) {
      case SmartFolderOperator.CONTAINS:
        return candidate.includes(expected);
      case SmartFolderOperator.NOT_CONTAINS:
        return !candidate.includes(expected);
      case SmartFolderOperator.EQUALS:
        return candidate === expected;
      case SmartFolderOperator.NOT_EQUALS:
        return candidate !== expected;
      case SmartFolderOperator.IS_EMPTY:
        return candidate.length <= 0;
      case SmartFolderOperator.IS_NOT_EMPTY:
        return candidate.length > 0;
      default:
        return false;
    }
  }

  private getConditionTextValue(condition: SmartFolderCondition): string {
    return typeof condition.value === 'string'
      ? condition.value.toLowerCase()
      : '';
  }

  private getConditionCandidate(
    resource: Resource,
    field?: SmartFolderField,
  ): string {
    switch (field) {
      case SmartFolderField.TITLE:
        return (resource.name || '').toLowerCase();
      case SmartFolderField.URL:
        return String(resource.attrs?.url || '').toLowerCase();
      case SmartFolderField.FILE_NAME:
        return String(
          resource.attrs?.original_name ||
            resource.attrs?.filename ||
            resource.name ||
            '',
        ).toLowerCase();
      case SmartFolderField.CONTENT:
        return this.getContentCandidate(resource);
      case SmartFolderField.TAGS:
        return (resource.tagIds || []).join(' ').toLowerCase();
      default:
        return '';
    }
  }

  private getContentCandidate(resource: Resource): string {
    const parts = [
      resource.content,
      resource.attrs?.transcript,
      resource.attrs?.parsed_content,
      resource.attrs?.description,
      resource.attrs?.summary,
      resource.attrs?.text,
    ];

    return parts
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .join('\n')
      .toLowerCase();
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
