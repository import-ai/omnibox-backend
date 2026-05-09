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
  SmartFolderOwnerScope,
  SmartFolderRootScope,
} from 'omniboxd/smart-folders/entities/smart-folder-config.entity';
import {
  ISmartFolderEntitlementsProvider,
  SMART_FOLDER_ENTITLEMENTS_PROVIDER,
} from 'omniboxd/smart-folders/smart-folder-entitlements.interface';
import { SmartFoldersRuleService } from 'omniboxd/smart-folders/smart-folders-rule.service';
import { TagService } from 'omniboxd/tag/tag.service';
import { transaction } from 'omniboxd/utils/transaction-utils';
import { I18nService } from 'nestjs-i18n';
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
    private readonly tagService: TagService,
    private readonly i18n: I18nService,
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
    const ownerScope = dto.ownerScope ?? SmartFolderOwnerScope.PRIVATE;
    const rootScope = dto.rootScope;
    this.assertValidScope(ownerScope, rootScope);
    await this.assertEntitlements(
      namespaceId,
      userId,
      ownerScope,
      conditions.length,
    );

    const parentId = await this.getOwnerRootId(userId, namespaceId, ownerScope);

    const resource = await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;
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

  async isResourceMatched(
    userId: string,
    namespaceId: string,
    smartFolderId: string,
    resourceId: string,
  ): Promise<boolean> {
    const children = await this.listChildren(
      userId,
      namespaceId,
      smartFolderId,
    );
    return children.some((child) => child.id === resourceId);
  }

  private async getScopedVisibleResourceIds(
    userId: string,
    namespaceId: string,
    rootScope: SmartFolderRootScope,
    visibleResourceIds: string[],
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
      const visibleResourceIdSet = new Set(visibleResourceIds);
      scopedVisibleResourceIds.add(rootResourceId);

      for (const resource of scopedResources) {
        if (visibleResourceIdSet.has(resource.id)) {
          scopedVisibleResourceIds.add(resource.id);
        }
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
    const ownerScope = dto.ownerScope ?? config.ownerScope;
    const rootScope = dto.rootScope ?? config.rootScope;
    this.assertValidScope(ownerScope, rootScope);
    if (dto.ownerScope !== undefined && dto.ownerScope !== config.ownerScope) {
      await this.assertEntitlements(
        namespaceId,
        userId,
        ownerScope,
        conditions.length,
      );
    } else {
      await this.assertRuleLimit(namespaceId, userId, conditions.length);
    }

    await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;
      const resourceUpdates: { name?: string; parentId?: string } = {};

      if (dto.name !== undefined) {
        resourceUpdates.name = dto.name;
      }

      if (
        dto.ownerScope !== undefined &&
        dto.ownerScope !== config.ownerScope
      ) {
        resourceUpdates.parentId = await this.getOwnerRootId(
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
      throw new AppException(
        'Team smart folder can only filter teamspace resources',
        'SMART_FOLDER_SCOPE_INVALID',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private async getOwnerRootId(
    userId: string,
    namespaceId: string,
    scope: 'private' | 'teamspace',
  ): Promise<string> {
    return scope === 'private'
      ? await this.namespacesService.getPrivateRootId(userId, namespaceId)
      : (await this.namespacesService.getTeamspaceRoot(namespaceId)).id;
  }

  private async assertEntitlements(
    namespaceId: string,
    userId: string,
    ownerScope: SmartFolderOwnerScope,
    ruleCount: number,
  ): Promise<void> {
    const entitlements = await this.assertRuleLimit(
      namespaceId,
      userId,
      ruleCount,
    );

    const limit =
      ownerScope === SmartFolderOwnerScope.PRIVATE
        ? entitlements.privateLimit
        : entitlements.teamLimit;
    // A negative limit is treated as unlimited.
    if (limit < 0) {
      return;
    }

    const count = await this.countActive(namespaceId, userId, ownerScope);
    if (count >= limit) {
      const message = this.i18n.t('resource.errors.smartFolderQuotaExceeded');
      throw new AppException(
        message,
        'SMART_FOLDER_QUOTA_EXCEEDED',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private async assertRuleLimit(
    namespaceId: string,
    userId: string,
    ruleCount: number,
  ) {
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
    return entitlements;
  }

  private async countActive(
    namespaceId: string,
    userId: string,
    ownerScope: SmartFolderOwnerScope,
  ): Promise<number> {
    const queryBuilder = this.smartFolderConfigRepository
      .createQueryBuilder('config')
      .innerJoin('resources', 'resource', 'resource.id = config.resource_id')
      .where('config.namespace_id = :namespaceId', { namespaceId })
      .andWhere('config.owner_scope = :ownerScope', { ownerScope })
      .andWhere('resource.deleted_at IS NULL');

    if (ownerScope === SmartFolderOwnerScope.PRIVATE) {
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
    if (condition.field === SmartFolderField.CREATED_AT) {
      return this.matchesDateCondition(resource.createdAt, condition);
    }

    if (
      condition.field === SmartFolderField.URL &&
      resource.resourceType !== ResourceType.LINK
    ) {
      return false;
    }

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
          resource.attrs?.original_name || resource.attrs?.filename || '',
        ).toLowerCase();
      case SmartFolderField.CONTENT:
        return this.getContentCandidate(resource);
      case SmartFolderField.TAGS:
        return this.getTagsCandidate(resource);
      default:
        return '';
    }
  }

  private matchesDateCondition(
    createdAt: Date,
    condition: SmartFolderCondition,
  ): boolean {
    const operator = condition.operator;
    const value =
      typeof condition.value === 'object' && condition.value !== null
        ? condition.value
        : {};
    const createdAtTime = createdAt.getTime();

    switch (operator) {
      case SmartFolderOperator.RECENT: {
        const since = this.getRecentSince(value.amount, value.unit);
        return since === null ? false : createdAtTime >= since.getTime();
      }
      case SmartFolderOperator.EARLIER_THAN: {
        const since = this.getRecentSince(value.amount, value.unit);
        return since === null ? false : createdAtTime < since.getTime();
      }
      case SmartFolderOperator.BEFORE: {
        const range = this.getDayRange(value.date);
        return range === null ? false : createdAtTime < range.start.getTime();
      }
      case SmartFolderOperator.AFTER: {
        const range = this.getDayRange(value.date);
        return range === null ? false : createdAtTime >= range.end.getTime();
      }
      case SmartFolderOperator.ON: {
        const range = this.getDayRange(value.date);
        return range === null
          ? false
          : createdAtTime >= range.start.getTime() &&
              createdAtTime < range.end.getTime();
      }
      case SmartFolderOperator.NOT_ON: {
        const range = this.getDayRange(value.date);
        return range === null
          ? false
          : createdAtTime < range.start.getTime() ||
              createdAtTime >= range.end.getTime();
      }
      case SmartFolderOperator.BETWEEN: {
        const start = this.getDayRange(value.startDate);
        const end = this.getDayRange(value.endDate);
        return start === null || end === null
          ? false
          : createdAtTime >= start.start.getTime() &&
              createdAtTime < end.end.getTime();
      }
      default:
        return false;
    }
  }

  private getRecentSince(
    amount?: number,
    unit?: string,
    now = new Date(),
  ): Date | null {
    if (!amount || amount <= 0 || !unit) {
      return null;
    }

    const since = new Date(now);
    switch (unit) {
      case 'day':
        since.setUTCDate(since.getUTCDate() - amount);
        return since;
      case 'week':
        since.setUTCDate(since.getUTCDate() - amount * 7);
        return since;
      case 'month':
        since.setUTCMonth(since.getUTCMonth() - amount);
        return since;
      case 'quarter':
        since.setUTCMonth(since.getUTCMonth() - amount * 3);
        return since;
      case 'year':
        since.setUTCFullYear(since.getUTCFullYear() - amount);
        return since;
      default:
        return null;
    }
  }

  private getDayRange(date?: string): { start: Date; end: Date } | null {
    if (!date) {
      return null;
    }

    const dateOnly = date.includes('T') ? date.split('T')[0] : date;
    const start = new Date(`${dateOnly}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) {
      return null;
    }

    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }

  private getTagsCandidate(resource: Resource): string {
    const values = [...(resource.tagIds || [])];
    const tagNames = [resource.attrs?.tags, resource.attrs?.tag_names]
      .flatMap((value) => (Array.isArray(value) ? value : []))
      .map((value) =>
        typeof value === 'string'
          ? value
          : typeof value?.name === 'string'
            ? value.name
            : '',
      )
      .filter((value) => value.length > 0);

    return [...values, ...tagNames].join(' ').toLowerCase();
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
