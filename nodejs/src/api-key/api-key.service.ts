import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { APIKey } from './api-key.entity';

@Injectable()
export class APIKeyService {
  constructor(
    @InjectRepository(APIKey)
    private readonly apiKeyRepository: Repository<APIKey>,
  ) {}

  async create(apiKey: Partial<APIKey>): Promise<APIKey> {
    return this.apiKeyRepository.save(apiKey);
  }

  async findOne(api_key: string): Promise<APIKey | null> {
    return this.apiKeyRepository.findOne({ where: { api_key: api_key } });
  }
}
