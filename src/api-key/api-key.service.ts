import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { APIKey } from 'omniboxd/api-key/api-key.entity';
import {
  CreateAPIKeyDto,
  UpdateAPIKeyDto,
  APIKeyResponseDto,
} from 'omniboxd/api-key/api-key.dto';

@Injectable()
export class APIKeyService {
  constructor(
    @InjectRepository(APIKey)
    private readonly apiKeyRepository: Repository<APIKey>,
  ) {}

  async create(createApiKeyDto: CreateAPIKeyDto): Promise<APIKeyResponseDto> {
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
}
