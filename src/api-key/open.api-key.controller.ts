import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import { APIKeyInfoResponseDto } from 'omniboxd/api-key/api-key.dto';
import { APIKey as APIKeyEntity } from 'omniboxd/api-key/api-key.entity';
import { Controller, Delete, Get } from '@nestjs/common';
import { APIKey, APIKeyAuth } from 'omniboxd/auth/decorators';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { SkipOpenAPIQuota } from 'omniboxd/open-api/open-api-quota.decorator';

@ApiTags('API Keys')
@ApiSecurity('api-key')
@SkipOpenAPIQuota()
@Controller('open/api/v1/api-keys')
export class OpenAPIKeyController {
  constructor(private readonly apiKeyService: APIKeyService) {}

  @Get('info')
  @APIKeyAuth()
  @ApiOperation({
    summary: 'Get API key information',
    description:
      'Returns metadata for the current API key, including its namespace, root resource scope, and configured permissions.',
  })
  @ApiResponse({
    status: 200,
    description: 'API key information retrieved successfully',
    type: APIKeyInfoResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async info(@APIKey() apiKey: APIKeyEntity): Promise<APIKeyInfoResponseDto> {
    return await this.apiKeyService.info(apiKey);
  }

  @Delete()
  @APIKeyAuth()
  @ApiOperation({
    summary: 'Delete the current API key',
    description:
      'Deletes the current API key and related application records. The key can no longer be used after this request succeeds.',
  })
  @ApiResponse({ status: 200, description: 'API key deleted successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  async delete(@APIKey() apiKey: APIKeyEntity): Promise<void> {
    return await this.apiKeyService.delete(apiKey.id);
  }
}
