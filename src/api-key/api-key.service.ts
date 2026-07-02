import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { I18nService } from 'nestjs-i18n';
import {
  APIKeyInfoResponseDto,
  APIKeyResponseDto,
  APIKeyRootResourceDto,
  APIKeyRootResourceType,
  CreateAPIKeyDto,
  PatchAPIKeyDto,
  UpdateAPIKeyDto,
} from 'omniboxd/api-key/api-key.dto';
import {
  API_KEY_NOTE_MAX_LENGTH,
  API_KEY_PERMISSION_MATRIX,
  APIKey,
  APIKeyAttrs,
  APIKeyPermission,
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { Applications } from 'omniboxd/applications/applications.entity';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { NamespaceResponseDto } from 'omniboxd/namespaces/dto/namespace-response.dto';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { NamespacesQuotaService } from 'omniboxd/namespaces/namespaces-quota.service';
import { OpenAPIQuotaService } from 'omniboxd/open-api/open-api-quota.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { ResourceMetaDto } from 'omniboxd/resources/dto/resource-meta.dto';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import { UserResponseDto } from 'omniboxd/user/dto/user-response.dto';
import { UserService } from 'omniboxd/user/user.service';
import { Repository } from 'typeorm';

@Injectable()
export class APIKeyService {
  constructor(
    @InjectRepository(APIKey)
    private readonly apiKeyRepository: Repository<APIKey>,
    @InjectRepository(Applications)
    private readonly applicationsRepository: Repository<Applications>,
    private readonly permissionsService: PermissionsService,
    private readonly namespacesService: NamespacesService,
    private readonly namespacesQuotaService: NamespacesQuotaService,
    private readonly openAPIQuotaService: OpenAPIQuotaService,
    private readonly resourcesService: ResourcesService,
    private readonly userService: UserService,
    private readonly i18n: I18nService,
  ) {}

  async create(createApiKeyDto: CreateAPIKeyDto): Promise<APIKeyResponseDto> {
    this.validateAttrs(createApiKeyDto.attrs);

    // Validate user has permission to the namespace
    await this.validateUserNamespacePermission(
      createApiKeyDto.user_id,
      createApiKeyDto.namespace_id,
    );

    // If root_resource_id is provided, validate user has write permission to it
    if (createApiKeyDto.attrs?.root_resource_id) {
      await this.validateUserResourcePermission(
        createApiKeyDto.user_id,
        createApiKeyDto.namespace_id,
        createApiKeyDto.attrs.root_resource_id,
      );
    }

    const value = await this.generateUniqueApiKeyValue();

    const apiKey = this.apiKeyRepository.create({
      value,
      userId: createApiKeyDto.user_id,
      namespaceId: createApiKeyDto.namespace_id,
      attrs: createApiKeyDto.attrs,
    });

    const saved = await this.apiKeyRepository.save(apiKey);
    return APIKeyResponseDto.fromEntity(saved);
  }

  async findOne(id: string): Promise<APIKeyResponseDto> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { id } });
    if (!apiKey) {
      const message = this.i18n.t('apikey.errors.apiKeyNotFound');
      throw new AppException(
        message,
        'API_KEY_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return APIKeyResponseDto.fromEntity(apiKey);
  }

  async findByValue(value: string): Promise<APIKey | null> {
    return await this.apiKeyRepository.findOne({ where: { value } });
  }

  async findAll(
    userId?: string,
    namespaceId?: string,
  ): Promise<APIKeyResponseDto[]> {
    const where: any = {};
    if (userId) where.userId = userId;
    if (namespaceId) where.namespaceId = namespaceId;

    const apiKeys = await this.apiKeyRepository.find({ where });
    const rootResourceMap = await this.resolveRootResources(apiKeys);
    return apiKeys.map((apiKey) =>
      APIKeyResponseDto.fromEntity(
        apiKey,
        rootResourceMap.get(apiKey.id) ?? null,
      ),
    );
  }

  private async resolveRootResources(
    apiKeys: APIKey[],
  ): Promise<Map<string, APIKeyRootResourceDto | null>> {
    const result = new Map<string, APIKeyRootResourceDto | null>();
    const apiKeysWithRootResource = apiKeys.filter(
      (apiKey) => apiKey.attrs?.root_resource_id,
    );

    if (apiKeysWithRootResource.length === 0) {
      return result;
    }

    const namespaceRootCache = new Map<
      string,
      { privateRootId?: string; teamspaceRootId?: string }
    >();

    const grouped = new Map<string, APIKey[]>();
    for (const apiKey of apiKeysWithRootResource) {
      const key = `${apiKey.namespaceId}:${apiKey.userId}`;
      grouped.set(key, [...(grouped.get(key) ?? []), apiKey]);
    }

    await Promise.all(
      Array.from(grouped.values()).map(async (group) => {
        const [{ namespaceId, userId }] = group;
        const resourceIds = group.map(
          (apiKey) => apiKey.attrs.root_resource_id,
        );
        const parentResourceMap =
          await this.resourcesService.batchGetParentResources(
            namespaceId,
            resourceIds,
          );
        const rootIds = await this.getNamespaceRootIds(
          userId,
          namespaceId,
          namespaceRootCache,
        );

        await Promise.all(
          group.map(async (apiKey) => {
            const rootResource = await this.resolveRootResource(
              apiKey,
              parentResourceMap,
              rootIds,
            );
            result.set(apiKey.id, rootResource);
          }),
        );
      }),
    );

    return result;
  }

  private async getNamespaceRootIds(
    userId: string,
    namespaceId: string,
    cache: Map<string, { privateRootId?: string; teamspaceRootId?: string }>,
  ): Promise<{ privateRootId?: string; teamspaceRootId?: string }> {
    const key = `${namespaceId}:${userId}`;
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    const rootIds: { privateRootId?: string; teamspaceRootId?: string } = {};

    try {
      rootIds.privateRootId = await this.namespacesService.getPrivateRootId(
        userId,
        namespaceId,
      );
    } catch {
      // Treat missing roots the same as missing resources for display.
    }

    try {
      const teamspaceRoot =
        await this.namespacesService.getTeamspaceRoot(namespaceId);
      rootIds.teamspaceRootId = teamspaceRoot.id;
    } catch {
      // Treat missing roots the same as missing resources for display.
    }

    cache.set(key, rootIds);
    return rootIds;
  }

  private async resolveRootResource(
    apiKey: APIKey,
    parentResourceMap: Map<string, ResourceMetaDto>,
    rootIds: { privateRootId?: string; teamspaceRootId?: string },
  ): Promise<APIKeyRootResourceDto | null> {
    const resourceId = apiKey.attrs?.root_resource_id;
    if (!resourceId) {
      return null;
    }

    const path = this.buildResourcePath(resourceId, parentResourceMap);
    if (path.length === 0) {
      return null;
    }

    const hasViewPermission = await this.permissionsService.userHasPermission(
      apiKey.namespaceId,
      resourceId,
      apiKey.userId,
      ResourcePermission.CAN_VIEW,
      [...path].reverse(),
    );
    if (!hasViewPermission) {
      return null;
    }

    const root = path[0];
    return {
      id: resourceId,
      root_type: this.getRootResourceType(root.id, rootIds),
      path: path.map((resource) => ({ id: resource.id, name: resource.name })),
    };
  }

  private buildResourcePath(
    resourceId: string,
    resourceMap: Map<string, ResourceMetaDto>,
  ): ResourceMetaDto[] {
    const path: ResourceMetaDto[] = [];
    const visited = new Set<string>();
    let current: ResourceMetaDto | undefined = resourceMap.get(resourceId);

    while (current) {
      if (visited.has(current.id)) {
        return [];
      }
      visited.add(current.id);
      path.push(current);
      current = current.parentId
        ? resourceMap.get(current.parentId)
        : undefined;
    }

    return path.reverse();
  }

  private getRootResourceType(
    rootResourceId: string,
    rootIds: { privateRootId?: string; teamspaceRootId?: string },
  ): APIKeyRootResourceType {
    if (rootResourceId === rootIds.privateRootId) {
      return 'private';
    }
    if (rootResourceId === rootIds.teamspaceRootId) {
      return 'teamspace';
    }
    return 'unknown';
  }

  async update(
    id: string,
    updateApiKeyDto: UpdateAPIKeyDto,
  ): Promise<APIKeyResponseDto> {
    const updateData: Partial<APIKey> = {};
    if (updateApiKeyDto.attrs !== undefined) {
      this.validateAttrs(updateApiKeyDto.attrs);
      updateData.attrs = updateApiKeyDto.attrs;
    }

    await this.apiKeyRepository.update(id, updateData);
    return await this.findOne(id);
  }

  async patch(
    id: string,
    patchApiKeyDto: PatchAPIKeyDto,
  ): Promise<APIKeyResponseDto> {
    // Get the existing API key
    const existingApiKey = await this.apiKeyRepository.findOne({
      where: { id },
    });
    if (!existingApiKey) {
      const message = this.i18n.t('apikey.errors.apiKeyNotFound');
      throw new AppException(
        message,
        'API_KEY_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    // If root_resource_id is being updated, validate user has permission to it
    if (patchApiKeyDto.root_resource_id !== undefined) {
      await this.validateUserResourcePermission(
        existingApiKey.userId,
        existingApiKey.namespaceId,
        patchApiKeyDto.root_resource_id,
      );
    }

    // Prepare the updated attrs by merging with existing attrs
    const updatedAttrs = { ...existingApiKey.attrs };

    // Update only the fields that are provided
    if (patchApiKeyDto.root_resource_id !== undefined) {
      updatedAttrs.root_resource_id = patchApiKeyDto.root_resource_id;
    }
    if (patchApiKeyDto.permissions !== undefined) {
      updatedAttrs.permissions = patchApiKeyDto.permissions;
    }
    if (patchApiKeyDto.note !== undefined) {
      updatedAttrs.note = patchApiKeyDto.note;
    }
    this.validateAttrs(updatedAttrs);

    // Update the API key with the merged attrs
    await this.apiKeyRepository.update(id, { attrs: updatedAttrs });
    return await this.findOne(id);
  }

  async delete(id: string): Promise<void> {
    // Directly delete all applications that reference this API key
    await this.applicationsRepository.softDelete({
      apiKeyId: id,
    });

    // Then delete the API key itself
    const result = await this.apiKeyRepository.softDelete(id);
    if ((result.affected || 0) === 0) {
      const message = this.i18n.t('apikey.errors.apiKeyNotFound');
      throw new AppException(
        message,
        'API_KEY_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  private async generateUniqueApiKeyValue(): Promise<string> {
    let value: string;
    let isUnique = false;

    while (!isUnique) {
      // Generate 20 random bytes and convert to hex (40 characters)
      const randomHex = randomBytes(20).toString('hex');
      value = `sk-${randomHex}`;

      // Check if this value already exists
      const existing = await this.apiKeyRepository.findOne({
        where: { value },
      });
      isUnique = !existing;
    }

    return value!;
  }

  private validateAttrs(attrs?: APIKeyAttrs): void {
    if (attrs?.note !== undefined && typeof attrs.note !== 'string') {
      const message = this.i18n.t('validation.errors.isString');
      throw new AppException(
        message,
        'INVALID_API_KEY_NOTE',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      attrs?.note !== undefined &&
      attrs.note.length > API_KEY_NOTE_MAX_LENGTH
    ) {
      const message = this.i18n.t('apikey.errors.noteTooLong', {
        args: { max: API_KEY_NOTE_MAX_LENGTH },
      });
      throw new AppException(
        message,
        'API_KEY_NOTE_TOO_LONG',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (attrs?.permissions === undefined) {
      return;
    }
    if (!Array.isArray(attrs.permissions)) {
      const message = this.i18n.t('apikey.errors.invalidPermissions');
      throw new AppException(
        message,
        'INVALID_PERMISSIONS',
        HttpStatus.BAD_REQUEST,
      );
    }
    this.validatePermissions(attrs.permissions);
  }

  private validatePermissions(permissions: APIKeyPermission[]): void {
    for (const permission of permissions) {
      const target = permission?.target;
      if (!this.isValidTarget(target)) {
        const message = this.i18n.t('apikey.errors.invalidPermissionTarget', {
          args: { target },
        });
        throw new AppException(
          message,
          'INVALID_PERMISSION_TARGET',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!Array.isArray(permission.permissions)) {
        const message = this.i18n.t('apikey.errors.invalidPermissionAction', {
          args: { action: String(permission.permissions), target },
        });
        throw new AppException(
          message,
          'INVALID_PERMISSION_ACTION',
          HttpStatus.BAD_REQUEST,
        );
      }

      const allowedActions = API_KEY_PERMISSION_MATRIX[target];
      for (const action of permission.permissions) {
        if (!this.isValidAction(action)) {
          const message = this.i18n.t('apikey.errors.invalidPermissionAction', {
            args: { action, target },
          });
          throw new AppException(
            message,
            'INVALID_PERMISSION_ACTION',
            HttpStatus.BAD_REQUEST,
          );
        }

        if (!allowedActions.includes(action)) {
          const message = this.i18n.t(
            'apikey.errors.invalidPermissionCombination',
            {
              args: { action, target },
            },
          );
          throw new AppException(
            message,
            'INVALID_PERMISSION_COMBINATION',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }
  }

  private isValidTarget(target: unknown): target is APIKeyPermissionTarget {
    return Object.values(APIKeyPermissionTarget).includes(
      target as APIKeyPermissionTarget,
    );
  }

  private isValidAction(action: unknown): action is APIKeyPermissionType {
    return Object.values(APIKeyPermissionType).includes(
      action as APIKeyPermissionType,
    );
  }

  private async validateUserNamespacePermission(
    userId: string,
    namespaceId: string,
  ): Promise<void> {
    // Check if user is a member of the namespace
    const member = await this.namespacesService.getMemberByUserId(
      namespaceId,
      userId,
    );

    if (!member) {
      const message = this.i18n.t('apikey.errors.noPermissionForNamespace', {
        args: { userId, namespaceId },
      });
      throw new AppException(
        message,
        'NO_NAMESPACE_PERMISSION',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async validateUserResourcePermission(
    userId: string,
    namespaceId: string,
    resourceId: string,
  ): Promise<void> {
    const hasWritePermission = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      userId,
      ResourcePermission.CAN_EDIT, // Write permission requires at least CAN_EDIT
    );

    if (!hasWritePermission) {
      const message = this.i18n.t('apikey.errors.noWritePermission', {
        args: { userId, resourceId, namespaceId },
      });
      throw new AppException(
        message,
        'NO_WRITE_PERMISSION',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async info(apiKey: APIKey): Promise<APIKeyInfoResponseDto> {
    // Get the namespace
    const namespace = await this.namespacesService.getNamespace(
      apiKey.namespaceId,
    );

    // Get the user
    const user = await this.userService.find(apiKey.userId);

    // Get the namespace usage and Open API quota status
    const namespaceUsage = await this.namespacesQuotaService.getNamespaceUsage(
      apiKey.namespaceId,
    );
    const openApiRequestsQuota = await this.openAPIQuotaService.getQuotaStatus(
      apiKey.namespaceId,
      namespaceUsage,
    );

    // Convert entities to DTOs and return
    const apiKeyDto = APIKeyResponseDto.fromEntity(apiKey);
    const namespaceDto = NamespaceResponseDto.fromEntity(namespace);
    const userDto = UserResponseDto.fromEntity(user);

    return {
      apiKey: apiKeyDto,
      namespace: namespaceDto,
      user: userDto,
      namespaceUsage: namespaceUsage,
      openApiRequestsQuota,
    };
  }
}
