import { Repository } from 'typeorm';
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { APIKey } from 'omniboxd/api-key/api-key.entity';
import {
  CreateAPIKeyDto,
  UpdateAPIKeyDto,
  APIKeyResponseDto,
} from 'omniboxd/api-key/api-key.dto';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';

@Injectable()
export class APIKeyService {
  constructor(
    @InjectRepository(APIKey)
    private readonly apiKeyRepository: Repository<APIKey>,
    private readonly permissionsService: PermissionsService,
    private readonly namespacesService: NamespacesService,
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

    const apiKey = this.apiKeyRepository.create({
      userId: createApiKeyDto.user_id,
      namespaceId: createApiKeyDto.namespace_id,
      attrs: createApiKeyDto.attrs,
    });

    const saved = await this.apiKeyRepository.save(apiKey);
    return this.toResponseDto(saved);
  }

  async findOne(id: string): Promise<APIKeyResponseDto> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { id } });
    if (!apiKey) {
      throw new NotFoundException('API Key not found');
    }
    return this.toResponseDto(apiKey);
  }

  async findAll(
    userId?: string,
    namespaceId?: string,
  ): Promise<APIKeyResponseDto[]> {
    const where: any = {};
    if (userId) where.userId = userId;
    if (namespaceId) where.namespaceId = namespaceId;

    const apiKeys = await this.apiKeyRepository.find({ where });
    return apiKeys.map((apiKey) => this.toResponseDto(apiKey));
  }

  async update(
    id: string,
    updateApiKeyDto: UpdateAPIKeyDto,
  ): Promise<APIKeyResponseDto> {
    const updateData: Partial<APIKey> = {};
    if (updateApiKeyDto.user_id !== undefined)
      updateData.userId = updateApiKeyDto.user_id;
    if (updateApiKeyDto.namespace_id !== undefined)
      updateData.namespaceId = updateApiKeyDto.namespace_id;
    if (updateApiKeyDto.attrs !== undefined)
      updateData.attrs = updateApiKeyDto.attrs;

    await this.apiKeyRepository.update(id, updateData);
    return await this.findOne(id);
  }

  async delete(id: string): Promise<void> {
    const result = await this.apiKeyRepository.delete(id);
    if ((result.affected || 0) === 0) {
      throw new NotFoundException('API Key not found');
    }
  }

  private toResponseDto(apiKey: APIKey): APIKeyResponseDto {
    return {
      id: apiKey.id,
      user_id: apiKey.userId,
      namespace_id: apiKey.namespaceId,
      attrs: apiKey.attrs,
      created_at: apiKey.createdAt,
      updated_at: apiKey.updatedAt,
    };
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
      throw new ForbiddenException(
        `User ${userId} does not have permission to namespace ${namespaceId}`,
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
      throw new ForbiddenException(
        `User ${userId} does not have write permission to resource ${resourceId} in namespace ${namespaceId}`,
      );
    }
  }
}
