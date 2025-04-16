import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { APIKeyService } from './api-key.service';
import { APIKey } from './api-key.entity';

@Controller('api-keys')
export class APIKeyController {
  constructor(private readonly apiKeyService: APIKeyService) {}

  @Post()
  async create(@Body() apiKey: Partial<APIKey>): Promise<APIKey> {
    return this.apiKeyService.create(apiKey);
  }

  @Get(':api_key')
  async findOne(@Param('api_key') api_key: string): Promise<APIKey | null> {
    return this.apiKeyService.findOne(api_key);
  }
}
