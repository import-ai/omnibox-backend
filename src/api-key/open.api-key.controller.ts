import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import { APIKeyInfoDto } from 'omniboxd/api-key/api-key.dto';
import {
  APIKey as APIKeyEntity,
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { Controller, Get } from '@nestjs/common';
import { APIKey, APIKeyAuth } from 'omniboxd/auth/decorators';

@Controller('open/api/v1/api-keys')
export class OpenAPIKeyController {
  constructor(private readonly apiKeyService: APIKeyService) {}

  @Get('info')
  @APIKeyAuth({
    permissions: [
      {
        target: APIKeyPermissionTarget.RESOURCES,
        permissions: [APIKeyPermissionType.READ],
      },
    ],
  })
  async info(@APIKey() apiKey: APIKeyEntity): Promise<APIKeyInfoDto> {
    return await this.apiKeyService.info(apiKey);
  }
}
