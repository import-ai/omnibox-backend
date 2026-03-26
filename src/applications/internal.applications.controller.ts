import { ApplicationsService } from './applications.service';
import { Body, Controller, Param, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { Public } from 'omniboxd/auth';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Applications } from './applications.entity';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import {
  APIKeyPermissionTarget,
  APIKeyPermissionType,
} from 'omniboxd/api-key/api-key.entity';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';

class WechatClawBindingCallbackDto {
  session_key!: string;
  account_id!: string;
}

@Controller('internal/api/v1/applications')
export class InternalApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    @InjectRepository(Applications)
    private readonly applicationsRepository: Repository<Applications>,
    private readonly apiKeyService: APIKeyService,
    private readonly namespacesService: NamespacesService,
  ) {}

  @Public()
  @Post(':appId')
  async callback(
    @Param('appId') appId: string,
    @Body() data: Record<string, any>,
  ): Promise<any> {
    return await this.applicationsService.callback(appId, data);
  }

  @Public()
  @Post('wechat_claw/binding-callback')
  @HttpCode(HttpStatus.OK)
  async wechatClawBindingCallback(
    @Body() data: WechatClawBindingCallbackDto,
  ): Promise<any> {
    // Find the application by session_key
    const application = await this.applicationsRepository
      .createQueryBuilder()
      .where('app_id = :appId', { appId: 'wechat_claw' })
      .andWhere("attrs->>'session_key' = :sessionKey", {
        sessionKey: data.session_key,
      })
      .getOne();

    if (!application) {
      return { success: false, message: 'Application not found' };
    }

    // Get the private root resource id for API key permissions
    const privateRootResourceId = await this.namespacesService.getPrivateRootId(
      application.userId,
      application.namespaceId,
    );

    // Create API key with permissions
    const apiKeyResponse = await this.apiKeyService.create({
      user_id: application.userId,
      namespace_id: application.namespaceId,
      attrs: {
        related_app_id: 'wechat_claw',
        root_resource_id: privateRootResourceId,
        permissions: [
          {
            target: APIKeyPermissionTarget.RESOURCES,
            permissions: [
              APIKeyPermissionType.CREATE,
              APIKeyPermissionType.READ,
            ],
          },
          {
            target: APIKeyPermissionTarget.CHAT,
            permissions: [APIKeyPermissionType.CREATE],
          },
        ],
      },
    });

    // Update application with account_id and apiKeyId
    application.attrs = {
      ...application.attrs,
      account_id: data.account_id,
      binding_complete: true,
    };
    application.apiKeyId = apiKeyResponse.id;

    await this.applicationsRepository.save(application);

    return {
      success: true,
      application_id: application.id,
      api_key_id: apiKeyResponse.id,
    };
  }
}
