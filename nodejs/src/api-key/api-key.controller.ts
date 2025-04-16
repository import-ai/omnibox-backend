import { APIKey } from 'src/api-key/api-key.entity';
import { APIKeyService } from 'src/api-key/api-key.service';
import { Controller, Get, Post, Body, Param } from '@nestjs/common';

@Controller('api/v1/api-keys')
export class APIKeyController {
  constructor(private readonly apiKeyService: APIKeyService) {}

  @Post()
  async create(@Body() apiKey: Partial<APIKey>) {
    return this.apiKeyService.create(apiKey);
  }

  @Get(':api_key')
  async findOne(@Param('api_key') api_key: string) {
    return this.apiKeyService.findOne(api_key);
  }
}
