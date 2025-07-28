import { APIKey } from 'omniboxd/api-key/api-key.entity';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import { Get, Post, Body, Param, Controller } from '@nestjs/common';

@Controller('api/v1/api-keys')
export class APIKeyController {
  constructor(private readonly apiKeyService: APIKeyService) {}

  @Post()
  async create(@Body() apiKey: Partial<APIKey>) {
    return this.apiKeyService.create(apiKey);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.apiKeyService.findOne(id);
  }
}
