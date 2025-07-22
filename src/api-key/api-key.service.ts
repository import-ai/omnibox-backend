import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { APIKey } from 'omnibox-backend/api-key/api-key.entity';

@Injectable()
export class APIKeyService {
  constructor(
    @InjectRepository(APIKey)
    private readonly apiKeyRepository: Repository<APIKey>,
  ) {}

  async create(apiKey: Partial<APIKey>) {
    return this.apiKeyRepository.save(apiKey);
  }

  async findOne(id: string) {
    return this.apiKeyRepository.findOne({ where: { id } });
  }
}
