import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import {
  APIKeyResponseDto,
  CreateAPIKeyDto,
  PatchAPIKeyDto,
  UpdateAPIKeyDto,
} from 'omniboxd/api-key/api-key.dto';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';

@Controller('api/v1/api-keys')
export class APIKeyController {
  constructor(private readonly apiKeyService: APIKeyService) {}

  @Post()
  async create(
    @Body() createApiKeyDto: CreateAPIKeyDto,
  ): Promise<APIKeyResponseDto> {
    return await this.apiKeyService.create(createApiKeyDto);
  }

  @Get()
  async findAll(
    @Query('user_id') userId?: string,
    @Query('namespace_id') namespaceId?: string,
  ): Promise<APIKeyResponseDto[]> {
    if (!userId && !namespaceId) {
      throw new BadRequestException(
        'Either user_id or namespace_id must be provided',
      );
    }
    return await this.apiKeyService.findAll(userId, namespaceId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<APIKeyResponseDto> {
    return await this.apiKeyService.findOne(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateApiKeyDto: UpdateAPIKeyDto,
  ): Promise<APIKeyResponseDto> {
    return await this.apiKeyService.update(id, updateApiKeyDto);
  }

  @Patch(':id')
  async patch(
    @Param('id') id: string,
    @Body() patchApiKeyDto: PatchAPIKeyDto,
  ): Promise<APIKeyResponseDto> {
    return await this.apiKeyService.patch(id, patchApiKeyDto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<void> {
    return await this.apiKeyService.delete(id);
  }
}
