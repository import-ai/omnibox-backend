import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import { APIKeyInfoDto } from 'omniboxd/api-key/api-key.dto';
import { APIKey as APIKeyEntity } from 'omniboxd/api-key/api-key.entity';
import { Controller, Get } from '@nestjs/common';
import { APIKey, APIKeyAuth } from 'omniboxd/auth/decorators';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('API Keys')
@ApiSecurity('api-key')
@Controller('open/api/v1/api-keys')
export class OpenAPIKeyController {
  constructor(private readonly apiKeyService: APIKeyService) {}

  @Get('info')
  @APIKeyAuth()
  @ApiOperation({ summary: 'Get API key information' })
  @ApiResponse({
    status: 200,
    description: 'API key information retrieved successfully',
    type: APIKeyInfoDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async info(@APIKey() apiKey: APIKeyEntity): Promise<APIKeyInfoDto> {
    return await this.apiKeyService.info(apiKey);
  }
}
