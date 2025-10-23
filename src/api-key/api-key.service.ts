import { Repository } from 'typeorm';
import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { randomBytes } from 'crypto';
import { APIKey } from 'omniboxd/api-key/api-key.entity';
import {
  APIKeyInfoDto,
  APIKeyResponseDto,
  CreateAPIKeyDto,
  PatchAPIKeyDto,
  UpdateAPIKeyDto,
} from 'omniboxd/api-key/api-key.dto';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { Applications } from 'omniboxd/applications/applications.entity';
import { UserService } from 'omniboxd/user/user.service';
import { UserResponseDto } from 'omniboxd/user/dto/user-response.dto';
import { NamespaceResponseDto } from 'omniboxd/namespaces/dto/namespace-response.dto';

@Injectable()
export class APIKeyService {
  constructor(
    @InjectRepository(APIKey)
    private readonly apiKeyRepository: Repository<APIKey>,
    @InjectRepository(Applications)
    private readonly applicationsRepository: Repository<Applications>,
    private readonly permissionsService: PermissionsService,
    private readonly namespacesService: NamespacesService,
    private readonly userService: UserService,
    private readonly i18n: I18nService,
  ) {}

  async create(createApiKeyDto: CreateAPIKeyDto): Promise<APIKeyResponseDto> {
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
    return apiKeys.map((apiKey) => APIKeyResponseDto.fromEntity(apiKey));
  }

  async update(
    id: string,
    updateApiKeyDto: UpdateAPIKeyDto,
  ): Promise<APIKeyResponseDto> {
    const updateData: Partial<APIKey> = {};
    if (updateApiKeyDto.attrs !== undefined)
      updateData.attrs = updateApiKeyDto.attrs;

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

  async info(apiKey: APIKey): Promise<APIKeyInfoDto> {
    // Get the namespace
    const namespace = await this.namespacesService.getNamespace(
      apiKey.namespaceId,
    );

    // Get the user
    const user = await this.userService.find(apiKey.userId);

    // Convert entities to DTOs and return
    const apiKeyDto = APIKeyResponseDto.fromEntity(apiKey);
    const namespaceDto = NamespaceResponseDto.fromEntity(namespace);
    const userDto = UserResponseDto.fromEntity(user);

    return {
      api_key: apiKeyDto,
      namespace: namespaceDto,
      user: userDto,
    } as APIKeyInfoDto;
  }
}
